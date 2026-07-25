/** 英文停用词：从联想区关键词展示中过滤（小写匹配）。 */
const EN_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "and",
  "or",
  "but",
  "as",
  "by",
  "with",
  "from",
  "it",
  "this",
  "that"
]);

/** 中文助词、连词与数量填充词：仅用于关键词展示过滤。 */
const ZH_STOPWORDS = new Set([
  "的",
  "得",
  "地",
  "了",
  "着",
  "过",
  "之",
  "与",
  "及",
  "等",
  "一个",
  "多个",
  "一些",
  "几个",
  "这种",
  "那种",
  "以及",
  "或者",
  "而且",
  "但是",
  "因为",
  "所以",
  "如果",
  "虽然",
  "然而",
  "于是",
  "是",
  "为",
  "在",
  "于",
  "以",
  "对",
  "从",
  "将",
  "被",
  "把",
  "让",
  "给",
  "向",
  "由",
  "到",
  "和",
  "或",
  "而",
  "也",
  "都",
  "就",
  "还",
  "又",
  "只",
  "才",
  "很",
  "更",
  "最",
  "这",
  "那",
  "其",
  "它",
  "他",
  "她",
  "我",
  "你",
  "们",
  "不",
  "没",
  "无",
  "未",
  "上",
  "下",
  "中",
  "内",
  "外",
  "里",
  "吗",
  "呢",
  "吧",
  "啊",
  "呀",
  "么",
  "啦",
  "嘛"
]);

/** 含 `@` 的 token 视为类邮箱噪声。 */
const EMAIL_LIKE = /@/;

/** 字母、数字或 CJK——用于识别纯标点 token。 */
const ALNUM_OR_CJK = /[a-z0-9\u4e00-\u9fff]/i;

const SINGLE_CJK = /^[\u4e00-\u9fff]$/;

/**
 * 判断 token 是否应从 read 联想区关键词展示中排除。
 * 索引仍使用完整分词；本函数仅影响对外展示的关键词。
 */
export function isKbNoiseToken(term: string): boolean {
  if (!term || !term.trim()) return true;
  if (EMAIL_LIKE.test(term)) return true;
  if (!ALNUM_OR_CJK.test(term)) return true;
  if (EN_STOPWORDS.has(term.toLowerCase())) return true;
  if (ZH_STOPWORDS.has(term)) return true;
  // 单字 CJK 多为分词噪声（如「的/得」切分残留）。
  if (SINGLE_CJK.test(term)) return true;
  return false;
}
