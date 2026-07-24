import type {
  Association,
  MisalignmentCategory,
  RelationType,
  ResolvedSpan,
  Translation,
  UUID,
  VerseSpan,
  VersificationDetail,
} from './contracts.ts'

export const MOCK_TRANSLATION_IDS = {
  source: '11111111-1111-4111-8111-111111111111',
  target: '22222222-2222-4222-8222-222222222222',
} as const satisfies Record<string, UUID>

export const MOCK_VERSIFICATION_IDS = {
  source: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  target: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
} as const satisfies Record<string, UUID>

const CREATED_AT = '2026-07-21T12:00:00.000Z'

export const mockTranslations: Translation[] = [
  {
    id: MOCK_TRANSLATION_IDS.source,
    name: 'Frontier English',
    language: 'English',
    source_format: 'usx',
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  },
  {
    id: MOCK_TRANSLATION_IDS.target,
    name: 'Frontier Original',
    language: 'Hebrew / Greek',
    source_format: 'usx',
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
  },
]

export const mockVersifications: VersificationDetail[] = [
  {
    id: MOCK_VERSIFICATION_IDS.source,
    name: 'eng-mock',
    based_on: 'org',
    canonical: false,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    ingredient: {
      basedOn: 'org',
      maxVerses: {
        GEN: ['1', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '55'],
        EXO: ['1'],
        JOS: Array.from({ length: 19 }, (_, index) => (index === 18 ? '48' : '0')),
        PSA: ['0', '0', '0'],
        MAT: Array.from({ length: 17 }, (_, index) => (index === 16 ? '21' : '0')),
        SIR: Array.from({ length: 36 }, (_, index) => (index === 35 ? '13' : '0')),
      },
    },
  },
  {
    id: MOCK_VERSIFICATION_IDS.target,
    name: 'org',
    based_on: null,
    canonical: true,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    ingredient: {
      basedOn: null,
      maxVerses: {
        GEN: Array.from({ length: 32 }, (_, index) => (index === 0 ? '1' : index === 31 ? '1' : '0')),
        EXO: ['2'],
        JOS: Array.from({ length: 19 }, (_, index) => (index === 18 ? '47' : '0')),
        PSA: ['0', '0', '1'],
        REV: Array.from({ length: 22 }, (_, index) => (index === 21 ? '21' : '0')),
        SIR: Array.from({ length: 36 }, (_, index) => (index === 35 ? '13' : '0')),
      },
    },
  },
]

export const mockAssociations: Association[] = [
  {
    id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
    translation_id: MOCK_TRANSLATION_IDS.source,
    scheme_id: MOCK_VERSIFICATION_IDS.source,
    active: true,
  },
  {
    id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2',
    translation_id: MOCK_TRANSLATION_IDS.source,
    scheme_id: MOCK_VERSIFICATION_IDS.target,
    active: false,
  },
  {
    id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
    translation_id: MOCK_TRANSLATION_IDS.target,
    scheme_id: MOCK_VERSIFICATION_IDS.target,
    active: true,
  },
  {
    id: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc4',
    translation_id: MOCK_TRANSLATION_IDS.target,
    scheme_id: MOCK_VERSIFICATION_IDS.source,
    active: false,
  },
]

const verseSpan = (
  translationId: UUID,
  seq: number,
  book: string,
  chapter: number,
  verse: number,
  content: string,
  part: string | null = null,
): VerseSpan => ({
  id: `${translationId.slice(0, 8)}-0000-4000-8000-${String(seq).padStart(12, '0')}`,
  seq,
  book,
  chapter,
  verse,
  part,
  content,
})

export const mockSpansByTranslation: Record<UUID, VerseSpan[]> = {
  [MOCK_TRANSLATION_IDS.source]: [
    verseSpan(MOCK_TRANSLATION_IDS.source, 1, 'GEN', 1, 1, 'In the beginning, God created the heavens and the earth.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 2, 'GEN', 1, 2, 'The earth was unformed, and darkness covered the deep waters.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 3, 'GEN', 1, 3, 'Then God spoke, and light appeared.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 4, 'GEN', 1, 4, 'God saw that the light was good and separated it from darkness.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 10, 'GEN', 31, 53, 'The God of our fathers will judge between us.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 11, 'GEN', 31, 54, 'Jacob offered a sacrifice and shared a meal with his family.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 12, 'GEN', 31, 55, 'Early in the morning Laban blessed his family and departed.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 20, 'EXO', 1, 1, 'These are the names of the sons of Israel who came to Egypt.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 21, 'EXO', 1, 2, 'Each one arrived together with his household.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 22, 'EXO', 1, 3, 'The families of Reuben, Simeon, Levi, and Judah were among them.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 23, 'EXO', 1, 4, 'Issachar, Zebulun, Benjamin, Dan, and Naphtali also came.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 30, 'JOS', 19, 45, 'The inheritance included the towns surrounding the valley.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 31, 'JOS', 19, 46, 'Its border extended toward the sea and the neighboring district.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 32, 'JOS', 19, 47, 'The territory of Dan extended beyond them,'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 33, 'JOS', 19, 48, 'and these cities with their villages became their inheritance.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 34, 'JOS', 19, 49, 'When the division was complete, the assembly gathered again.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 40, 'PSA', 3, 0, 'A psalm of David when he fled from Absalom his son.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 41, 'PSA', 3, 1, 'How many are my enemies; many rise against me.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 42, 'PSA', 3, 2, 'Many say that no help remains for me.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 43, 'PSA', 3, 3, 'But you are a shield around me and the one who lifts my head.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 44, 'PSA', 3, 4, 'I call aloud, and an answer comes from the holy hill.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 50, 'MAT', 17, 19, 'The disciples came privately and asked why they had failed.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 51, 'MAT', 17, 20, 'He answered that even a little faith can move what seems immovable.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 52, 'MAT', 17, 21, 'But this kind does not go out except by prayer and fasting.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 53, 'MAT', 17, 22, 'While they gathered together, he spoke to them about what was ahead.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 54, 'MAT', 17, 23, 'They listened with grief and did not yet understand.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 60, 'SIR', 36, 12, 'Gather the nations so they may know your holy name.'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 61, 'SIR', 36, 13, 'Gather all the tribes of Jacob,', 'a'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 62, 'SIR', 36, 13, 'and restore their inheritance as it was at the beginning.', 'b'),
    verseSpan(MOCK_TRANSLATION_IDS.source, 63, 'SIR', 36, 14, 'Have compassion on the people who bear your name.'),
  ],
  [MOCK_TRANSLATION_IDS.target]: [
    verseSpan(MOCK_TRANSLATION_IDS.target, 101, 'GEN', 1, 1, 'At first God made the sky and the land.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 102, 'GEN', 1, 2, 'The land was empty, and darkness lay over the waters.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 103, 'GEN', 1, 3, 'God said that there should be light, and light came to be.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 104, 'GEN', 1, 4, 'The light was pleasing, and it was set apart from the darkness.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 110, 'GEN', 32, 1, 'Laban rose early, blessed them, and returned home.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 111, 'GEN', 32, 2, 'Jacob continued on his journey and met the messengers of God.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 112, 'GEN', 32, 3, 'He named that place after the camp he had seen there.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 120, 'EXO', 1, 1, 'These are the names of Israel’s sons who entered Egypt.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 121, 'EXO', 1, 2, 'Each arrived together with his household.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 122, 'EXO', 1, 3, 'Their families settled among the people already living there.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 123, 'EXO', 1, 4, 'In time their descendants became numerous throughout the land.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 130, 'JOS', 19, 45, 'The inheritance included the settlements near the valley.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 131, 'JOS', 19, 46, 'Its boundary reached toward the sea and the adjacent region.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 132, 'JOS', 19, 47, 'Dan’s border went out, and the cities and villages became their inheritance.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 133, 'JOS', 19, 48, 'The assembly completed the division of the land.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 140, 'PSA', 3, 1, 'A psalm of David, when he fled from Absalom his son.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 141, 'PSA', 3, 2, 'Many foes rise against me and surround me.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 142, 'PSA', 3, 3, 'They say that deliverance will not come.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 143, 'PSA', 3, 4, 'Yet you are my shield, my honor, and the lifter of my head.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 144, 'PSA', 3, 5, 'I cry out, and you answer from the holy mountain.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 150, 'MAT', 17, 19, 'The disciples asked privately why they had been unable to help.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 151, 'MAT', 17, 20, 'He told them that sincere faith can overcome great obstacles.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 152, 'MAT', 17, 22, 'While they gathered, he spoke about the journey before them.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 153, 'MAT', 17, 23, 'They were deeply troubled by what they heard.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 160, 'SIR', 36, 12, 'Bring the peoples together so that they may know your name.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 161, 'SIR', 36, 13, 'Gather Jacob’s scattered tribes,', 'a'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 162, 'SIR', 36, 13, 'assemble the inheritance of Jacob.', 'b'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 163, 'SIR', 36, 14, 'Show mercy to the people called by your name.'),
    verseSpan(MOCK_TRANSLATION_IDS.target, 170, 'REV', 22, 21, 'The grace of the Lord Jesus be with all.'),
  ],
}

export interface ViewerFixture {
  id: string
  label: string
  relation: RelationType
  category: MisalignmentCategory
  source_spans: ResolvedSpan[]
  target_spans: ResolvedSpan[]
}

const resolved = (ref: string, seq: number, part: string | null = null): ResolvedSpan => ({
  ref,
  seq,
  part,
})

export const viewerFixtures: ViewerFixture[] = [
  {
    id: 'one-to-one',
    label: 'One-to-one verse',
    relation: 'one_to_one',
    category: 'other',
    source_spans: [resolved('GEN 1:1', 1)],
    target_spans: [resolved('GEN 1:1', 101)],
  },
  {
    id: 'shift',
    label: 'Psalm title shift',
    relation: 'shift',
    category: 'psalm_title',
    source_spans: [resolved('PSA 3:0', 40)],
    target_spans: [resolved('PSA 3:1', 140)],
  },
  {
    id: 'renumber',
    label: 'Chapter-boundary renumber',
    relation: 'renumber',
    category: 'chapter_boundary',
    source_spans: [resolved('GEN 31:55', 12)],
    target_spans: [resolved('GEN 32:1', 110)],
  },
  {
    id: 'split',
    label: 'One verse split into two',
    relation: 'split',
    category: 'other',
    source_spans: [resolved('EXO 1:1', 20)],
    target_spans: [resolved('EXO 1:1', 120), resolved('EXO 1:2', 121)],
  },
  {
    id: 'merge',
    label: 'Two verses merged into one',
    relation: 'merge',
    category: 'other',
    source_spans: [resolved('JOS 19:47', 32), resolved('JOS 19:48', 33)],
    target_spans: [resolved('JOS 19:47', 132)],
  },
  {
    id: 'exclude-source',
    label: 'Verse omitted from the target',
    relation: 'exclude',
    category: 'nt_omission',
    source_spans: [resolved('MAT 17:21', 52)],
    target_spans: [],
  },
  {
    id: 'partial',
    label: 'Partial-verse correspondence',
    relation: 'partial',
    category: 'other',
    source_spans: [resolved('SIR 36:13', 61, 'a')],
    target_spans: [resolved('SIR 36:13', 162, 'b')],
  },
]

export const reverseOnlyViewerFixtures: ViewerFixture[] = [
  {
    id: 'exclude-target',
    label: 'Verse omitted from the source',
    relation: 'exclude',
    category: 'nt_omission',
    source_spans: [resolved('REV 22:21', 170)],
    target_spans: [],
  },
]
