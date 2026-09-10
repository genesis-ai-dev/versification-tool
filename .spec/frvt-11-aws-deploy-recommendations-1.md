# AWS deployment recommendations for Frontier R&D

**Document:** `frvt-11-aws-deploy-recommendations-1`
**Audience:** Operators deploying FRVT in Frontier R&D’s AWS account
**Maps to:** acceptance criterion 3 (unauthorized use and DDoS)
**Scope:** Advice only. Do not implement these controls in this repository or the demo account as part of the current work. This is not a Terraform backlog or a runbook for the existing demo.

FRVT’s process-level defenses are HTTP Basic authentication plus a failed-auth limiter. Those are necessary. They are **not** enough against DDoS, and they are not enough against unauthorized use if the host, database, or credentials are exposed the way the demo is.

---

## How the application authenticates

Every HTTP route the process serves (API, interactive docs, OpenAPI JSON, and the static UI) requires HTTP Basic unless an operator explicitly opts a path prefix out. There is a single shared username and password for the whole app. There are no per-user accounts, cookies, sessions, or OAuth.

Failed Basic attempts are counted per client IP in a sliding window of **60 seconds**. The first **10** failures in that window return the same unauthorized response as usual. The 11th and later return “too many requests” with a retry delay. A successful login from that IP is not delayed, and it does not clear the failure window.

That limiter lives in process memory. Each process has its own counters. It is meant to slow credential guessing against one worker, not to absorb a flood or to coordinate across a fleet.

Two settings change this picture and must stay conservative in production:

- `BASIC_AUTH_PUBLIC_PATHS` defaults to empty (every route stays gated). The prefix `/` opts **every** path out of both Basic and the limiter.
- `TRUST_PROXY_HEADERS` defaults to off. When on, the limiter keys on the rightmost `X-Forwarded-For` hop instead of the TCP peer. Turn it on only when a trusted proxy (typically an Application Load Balancer) sits in front of the process and the process is **not** reachable any other way.

The baked-in local defaults are username `admin` and password `Admin123!` (`BASIC_AUTH_USERNAME` / `BASIC_AUTH_PASSWORD`). If those are still in effect at startup, the process logs a warning and **still serves**. It will not refuse to boot.

If either `BASIC_AUTH_FAILURE_LIMIT` or `BASIC_AUTH_FAILURE_WINDOW_SECONDS` is non-positive, the limiter is disabled entirely. Failures stay unauthorized; they never become “too many requests.”

---

## Demo baseline (do not copy)

This is a frozen snapshot of the current demo in `us-east-1`. Use it as an instructive baseline for Frontier’s own account, not as a pattern to reproduce.

**Load balancer.** An internet-facing Application Load Balancer named `frvt-demo` terminates TLS. Port 80 issues a **301** redirect to HTTPS on 443 (the app is not served in cleartext). The certificate is an ACM certificate on the load balancer’s own DNS name. The target group forwards HTTP to port **8000** on the instance, and that target is healthy. The load balancer’s security group allows 80 and 443 from the entire internet (`0.0.0.0/0`): that is the public front door, which is why TLS, and later WAF and access logs, belong on this balancer rather than on the instance.

**Compute.** A single EC2 instance `versification-demo` (`t3.medium`) sits in a **public** subnet with a **public IP**. It has no instance profile (no IAM role on the box), so the instance cannot call AWS APIs as itself. The instance security group allows TCP **8000** only from the load balancer’s security group, and SSH **22** only from one operator `/32`.

**Data and platform.** PostgreSQL runs **on the instance**, not as RDS. There is no ECS, Elastic Beanstalk, WAF web ACL, Shield Advanced subscription, GuardDuty detector, CloudTrail trail, ALB access-log bucket, or Route 53 hosted zone for this demo. The shape is one VM behind an ALB, not a container platform or PaaS. (CloudFront exists in the same AWS account for an unrelated S3 plugin repository; it is not in front of FRVT.)

**Application identity.** HTTP Basic is the only application identity check. Edge AWS controls are not part of that check.

The demo is a single public VM behind a TLS load balancer. That is enough to show the app. It is not a production posture.

---

## What the demo already does well

These three choices are worth keeping in Frontier’s account. They are the starting point, not the finish line.

**TLS on the load balancer, with HTTP redirected to HTTPS.** The Application Load Balancer presents a certificate and sends port 80 to HTTPS instead of serving the app in cleartext. That matters because Basic credentials are only a Base64 encoding of the username and password. On plain HTTP they travel in the clear and can be captured on the path. TLS at the edge is the minimum requirement for using Basic on a network you do not fully control. The process itself still speaks HTTP on 8000 to the load balancer; that is normal as long as 8000 is not reachable from the internet.

**Application port 8000 is closed to the internet.** Only the load balancer’s security group can open a TCP connection to the process. That matters because the load balancer is where TLS, (in production) WAF, and access logs belong. If anyone on the internet could hit 8000 directly, they would skip those edge controls even when the security group on 80/443 looks strict.

**SSH is pinned to a single `/32`.** Administrative login is limited to one known address, not the internet. That matters because SSH is a second door onto the host, independent of HTTP Basic. An open port 22 is a common unauthorized-use path that the application gate cannot see.

---

## Gaps versus a reasonable production posture

Each gap below is something the demo either exposes or omits. Frontier should close these in its own account.

### Public instance IP

The demo instance has a public address in a public subnet. Security groups currently keep 8000 off the internet, but a public IP still means the host is a routable destination. Anyone who can later open 8000 (a mistaken rule, a second process, a debug bind) talks to the app **without** going through the load balancer.

That bypass matters twice. First, TLS, WAF, and ALB logs never see the request. Second, if `TRUST_PROXY_HEADERS` is on, the client can send whatever `X-Forwarded-For` chain they want. The limiter trusts the rightmost hop in that header; a forged hop is a new limiter key, so guessing is no longer capped. Keep the instance private so the only path in is the load balancer.

### Database on the instance

Postgres shares the VM with the app. A host compromise (stolen SSH key, remote code execution, disk snapshot) is also a data compromise: the database files, and typically the database password, are on the same box.

A managed database in private subnets, reachable only from the app, splits that blast radius. Compromising the web process should not automatically yield a copy of the database files.

### No WAF, Shield Advanced, GuardDuty, CloudTrail, or ALB logs

The demo has none of the usual AWS detection and edge-filter layers:

- **AWS WAF** inspects HTTP requests at the load balancer before they reach the process. Without it, every flood, scanner, and password-guessing loop consumes application CPU and the in-process limiter.
- **AWS Shield** absorbs large volumetric DDoS against AWS IPs. **Standard** is included for all AWS customers (the demo does not “turn it off”). **Advanced** is a paid subscription the demo does not have; it adds specialist response and cost protections when the risk justifies it.
- **GuardDuty** looks at AWS telemetry for compromised instances, unusual API use, and recon. Without a detector, those signals are never raised.
- **CloudTrail** records management-plane API calls (who changed security groups, who created keys). Without a trail, unauthorized use of the AWS account itself is harder to prove or investigate.
- **ALB access logs** record each request at the load balancer (client, path, status, TLS). Without them, you cannot tell a DDoS or a guessing campaign from a quiet API, and you cannot reconstruct what reached the edge.

### Default Basic credentials still work

The local defaults `admin` / `Admin123!` are in the example environment and in the process defaults. The demo can still be using them. Startup only logs a warning; it never refuses to serve.

HTTP Basic here is a single shared secret for the entire product. If that secret is the published default, anyone who can reach the listener can read and change data. Rotate to a strong unique password before the app is on a shared or public network, and store it in environment variables or Secrets Manager, not in an image or a committed file.

### In-memory, per-process limiter

Counters are not shared across processes, hosts, or restarts. Running several workers multiplies how many guesses fit in the window, because each process enforces 10 failures on its own. A restart clears the windows. A non-positive `BASIC_AUTH_FAILURE_LIMIT` or `BASIC_AUTH_FAILURE_WINDOW_SECONDS` turns the limiter **off**.

This is credential-guessing friction, not flood protection. A DDoS does not need valid credentials. Unauthenticated HTTP requests do count as limiter failures, but the cap is per IP per process and only after the request has already reached the app. Volume against the pipe, the load balancer, or many source IPs, or a storm of failed Basic attempts against a small instance, can exhaust CPU, memory, or sockets long before this in-process counter helps. That is what WAF rate rules are for.

### `X-Forwarded-For` and extra proxies

An Application Load Balancer appends the connecting client as the **rightmost** hop of `X-Forwarded-For`. When `TRUST_PROXY_HEADERS` is on, the limiter uses that rightmost hop.

Two operator mistakes break that contract:

1. **Direct access to the process with `TRUST_PROXY_HEADERS` on.** The client is then both the TCP peer and the author of the header. They pick a fresh rightmost hop per request and never share a limiter key.
2. **Another reverse proxy in front of the load balancer** (CloudFront, nginx, a second balancer). The load balancer’s connecting client is that proxy, so the rightmost hop is the proxy, not the browser. Every user collapses onto one key (false lockouts) or, if that extra proxy is not stripping and setting the header carefully, clients can still inject hops. Treat this as an operator caution: either do not put an extra proxy in front, or understand that the limiter is now keying on the proxy, not the end user. Do not change how the application picks hops in order to paper over that topology.

Keep `TRUST_PROXY_HEADERS` **false** unless the process is reachable only through the trusted load balancer.

### Public documentation routes and a full opt-out

Interactive docs and OpenAPI JSON are useful on a laptop and dangerous on the public internet: they enumerate every route and payload shape. `BASIC_AUTH_PUBLIC_PATHS` can expose them (or anything else) without Basic.

The prefix `/` is the extreme case: it disables the gate and the limiter for **every** path. Leave `BASIC_AUTH_PUBLIC_PATHS` **empty** in production. Prefer a private load balancer, VPN, or IP allow-list if operators still need docs. Never set the public prefix to `/` outside local development.

---

## What to do in Frontier’s account

These are patterns for **eventual** deploys in Frontier R&D’s AWS account. They are not work items for this repository or for the demo account.

### Unauthorized use

**Put the app in private subnets with no public IP on the host.** The only internet path should be the load balancer (or a VPN / private balancer for internal-only use). That preserves TLS and any WAF in front of the process, and it removes the `X-Forwarded-For` spoofing path described above. Keep port 8000 allowed only from the load balancer’s security group. If SSH remains, keep it pinned to a known address as the demo already does; do not leave port 22 open to the internet.

**Run the database as RDS in private subnets, reachable only from the app.** Do not give the database a public endpoint. Security groups should allow the database port from the app’s security group only. That way a public HTTP attacker never talks to Postgres, and taking the web host is not the same as walking away with the data files.

**Do not ship default Basic credentials.** Set a unique `BASIC_AUTH_USERNAME` and a strong `BASIC_AUTH_PASSWORD` in the environment or in Secrets Manager, not in an image or a committed file. Rotate the password when people leave or when it may have leaked. Confirm at deploy time that the process is not still using `admin` / `Admin123!`.

**Set `TRUST_PROXY_HEADERS=true` only behind the Application Load Balancer (or an equivalent trusted proxy), and only when the process cannot be reached except through that proxy.** If the process is ever bound on a public address, or if operators connect straight to port 8000, leave the setting false so the limiter keys on the real TCP peer.

**Leave `BASIC_AUTH_PUBLIC_PATHS` empty.** Do not publish `/docs`, `/redoc`, or OpenAPI JSON on the public internet if you can avoid it. If operators still need documentation routes, prefer a private load balancer, VPN, or IP allow-list rather than an opt-out prefix. Never set the public prefix to `/` in production.

**Turn on CloudTrail and GuardDuty** (see DDoS below as well). They detect misuse of the AWS account and the instance, which HTTP Basic never sees.

### DDoS

**Associate an AWS WAF web ACL with the Application Load Balancer.** Include rate-based rules that cap requests per IP, including repeated authentication failures, at the edge. That drops floods and guessing loops before they reach the application process. The in-app 10-failures / 60-seconds / IP cap remains useful as a second line for credential guessing; it is not a substitute for WAF.

**Rely on Shield Standard (already included). Add Shield Advanced if the risk and cost justify it.** Standard covers common volumetric attacks against AWS-hosted addresses. Advanced is optional extra insurance and response, not a prerequisite for a first production deploy.

**Turn on ALB access logs, a CloudTrail trail, and GuardDuty.** ALB logs tell you what hit the edge and whether a spike is application traffic or abuse. CloudTrail records AWS account changes (security groups, keys, roles). GuardDuty raises likely instance or account compromise. Those last two are unauthorized-use controls as much as DDoS telemetry; without them, a flood or a takeover is harder to see and harder to explain after the fact.

**Treat the in-app limiter as guessing friction, not flood protection.** Keep the default 10 failures / 60 seconds / IP behavior enabled in production. Do not set a non-positive `BASIC_AUTH_FAILURE_LIMIT` or `BASIC_AUTH_FAILURE_WINDOW_SECONDS` on a public listener. Do not expect the limiter to save a small instance from a volumetric attack or from many workers each holding their own counters.

---

## Out of scope here

The following are **not** implemented in this repository or in the demo account by the current work, and this document does not ask anyone to implement them here:

- AWS WAF web ACLs
- Shield Advanced
- GuardDuty
- CloudTrail trails
- RDS
- Private subnets / removal of the demo instance’s public IP
- ALB access-log buckets
- Terraform or other infrastructure-as-code for the above

HTTP Basic and the failed-auth limiter in the application remain in place regardless of whether Frontier later adds those AWS controls.
