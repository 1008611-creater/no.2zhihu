import type { Accent } from "./types";

export const PUBLIC_FIGURE_LABEL = "公共人物 Skill · AI 基于公开资料推演";
export const PUBLIC_FIGURE_VERSION = "2026-09-15.1";

export interface PublicSource {
  title: string;
  author: string;
  url: string;
  locator: string;
  summary: string;
  verifiedAt?: string;
}

export interface PublicCapability {
  id: string;
  name: string;
  topics: string[];
  reasoningPattern: string[];
  boundary: string;
  sources: PublicSource[];
  status: "pending" | "verified";
}

export interface PublicFigure {
  id: string;
  name: string;
  accent: Accent;
  capabilities: PublicCapability[];
}

export interface PublicAttribution {
  personType: "public_figure";
  personId: string;
  personName: string;
  capabilityId: string;
  capabilityName: string;
  reasoningPattern: string[];
  methodSources: PublicSource[];
  version: string;
}

// 未经逐项核验的研究草案不能仅凭人物知名度变成可调用能力。
function capability(id: string, name: string, topics: string[], reasoningPattern: string[], boundary: string): PublicCapability {
  return { id, name, topics, reasoningPattern, boundary, sources: [], status: "pending" };
}

export const PUBLIC_FIGURES: PublicFigure[] = [
  { id: "elon_musk", name: "Elon Musk", accent: "blue", capabilities: [
    capability("manufacturing_cost", "制造成本拆解", ["制造", "硬件", "成本", "零件", "供应链"], ["列出材料与工序成本", "区分物理约束与习惯性要求", "评估删除和简化步骤的影响"], "不编造材料报价、工厂数据或具体降本比例。"),
    capability("first_principles", "第一性原理分析", ["原理", "物理", "约束", "假设"], ["写出待检验假设", "区分已知事实与类比", "从约束重新构造方案"], "推理不等于实验验证。"),
    capability("engineering_iteration", "快速工程迭代", ["工程", "迭代", "原型", "测试"], ["识别最关键的不确定性", "设计小规模试验", "根据反馈调整下一步"], "不得以速度为由跳过安全验证。"),
    capability("long_term_technology", "长周期技术投入", ["技术投入", "能源", "航天", "长期研发"], ["明确长期目标", "拆解阶段性里程碑", "审视资金和失败条件"], "不保证技术突破或投资回报。"),
  ] },
  { id: "steve_jobs", name: "Steve Jobs", accent: "violet", capabilities: [
    capability("experience_tradeoff", "用户体验取舍", ["体验", "用户", "易用", "交互"], ["确定用户要完成的任务", "识别使用摩擦", "比较功能增加与认知成本"], "不能代替当前用户研究。"),
    capability("product_focus", "产品聚焦", ["聚焦", "功能", "产品线", "优先级"], ["明确主要用户", "挑选核心任务", "列出暂缓的功能"], "聚焦不意味着忽略无障碍或可靠性。"),
    capability("integrated_design", "软硬件整体设计", ["软硬件", "设备", "生态", "系统设计"], ["审视完整使用链路", "定位组件之间的断点", "比较整体设计的收益与限制"], "不假设封闭生态总是更好。"),
    capability("product_expression", "产品表达", ["发布会", "产品表达", "演示", "介绍产品"], ["提炼核心价值", "用具体场景解释", "用可验证演示支撑表达"], "不虚构功能或用户评价。"),
  ] },
  { id: "peter_thiel", name: "Peter Thiel", accent: "orange", capabilities: [
    capability("differentiation", "差异化竞争", ["竞争", "差异化", "壁垒", "垄断"], ["识别同质化竞争", "寻找独特价值", "检验优势能否持续"], "不将商业优势等同合法性或公共利益。"),
    capability("small_market", "小市场切入", ["小市场", "细分市场", "切入", "利基"], ["界定初始用户群", "检验集中需求", "规划相邻市场扩展"], "市场规模必须用现实资料验证。"),
    capability("contrarian_hypothesis", "逆向假设检验", ["逆向", "共识", "秘密", "反常识"], ["写出主流假设", "寻找可反驳证据", "检验替代解释"], "反共识本身不是正确性的证据。"),
    capability("long_term_value", "长期价值判断", ["长期价值", "现金流", "持久", "未来价值"], ["区分短期增长与长期价值", "评估持续创造价值的机制", "明确关键不确定性"], "不提供保证收益的投资判断。"),
  ] },
  { id: "sam_altman", name: "Sam Altman", accent: "green", capabilities: [
    capability("startup_growth", "创业增长判断", ["创业", "增长", "留存", "初创"], ["确认用户是否真正需要产品", "选择有效增长指标", "区分增长与表面规模"], "不编造行业增长基准。"),
    capability("feedback_iteration", "产品反馈迭代", ["反馈", "迭代", "访谈", "用户需求"], ["收集实际使用反馈", "辨别反复出现的问题", "用小改动验证需求"], "不能把少量反馈当作总体结论。"),
    capability("technology_bet", "技术趋势下注", ["技术趋势", "人工智能", "技术路线", "AI行业"], ["识别技术能力变化", "检验可形成的用户价值", "规划可承受的试验"], "未来趋势必须以条件判断表达。"),
    capability("team_building", "人才与团队构建", ["招聘", "团队", "人才", "合伙人"], ["明确所需能力", "核对共同目标和合作方式", "通过实际协作验证"], "不凭人口属性推断能力。"),
  ] },
  { id: "lu_xun", name: "鲁迅", accent: "orange", capabilities: [
    capability("social_analysis", "社会现象剖析", ["社会现象", "舆论", "社会", "制度"], ["观察具体人物和行为", "审视利益与权力关系", "辨别表象与结构因素"], "文学分析不能替代统计事实。"),
    capability("narrative_analysis", "语言与叙事辨析", ["语言", "叙事", "话术", "宣传"], ["识别叙述立场", "寻找被省略的处境", "检验词语是否掩盖事实"], "不伪造鲁迅语录。"),
    capability("group_psychology", "群体心理观察", ["群体", "从众", "围观", "看客"], ["观察群体中的角色", "辨别从众与冷漠机制", "讨论个体承担的后果"], "不将文学角色直接归结为现实群体本性。"),
    capability("individual_condition", "个体处境审视", ["个体", "困境", "弱者", "处境"], ["描述个人所受限制", "区分选择与被迫", "审视改变条件的可能"], "不以道德批判替代具体帮助。"),
  ] },
  { id: "wang_yangming", name: "王阳明", accent: "green", capabilities: [
    capability("knowledge_action", "知行合一", ["知行", "行动", "拖延", "知道做不到"], ["明确所说的知道是什么", "找到可以实践的一步", "在行动中检验认识"], "不是对疾病或现实障碍的道德归责。"),
    capability("practice", "事上磨炼", ["磨炼", "实践", "困难", "历练"], ["回到具体事情", "辨别行动中的偏差", "反思并继续实践"], "不鼓励承受可避免的伤害。"),
    capability("self_reflection", "动机自省", ["动机", "自省", "私欲", "良知"], ["审视行动动机", "区分自利辩解与责任", "反思行为后果"], "不能用自省替代制度和专业支持。"),
    capability("responsibility", "行动与责任判断", ["责任", "担当", "抉择", "义务"], ["明确事情中的责任", "审视可采取的行动", "承担并复核行动后果"], "不将历史伦理直接当作现代法律。"),
  ] },
];

export function isCallable(capability: PublicCapability): boolean {
  return capability.status === "verified" && capability.sources.length >= 2 &&
    capability.sources.every(s => !!s.verifiedAt && !!s.locator && /^https:\/\//.test(s.url));
}

export function matchPublicCapability(personId: string, question: string) {
  const figure = PUBLIC_FIGURES.find(p => p.id === personId);
  if (!figure) return null;
  const text = question.normalize("NFKC").toLowerCase();
  const ranked = figure.capabilities.filter(isCallable).map(capability => ({
    capability, hits: capability.topics.filter(topic => text.includes(topic.toLowerCase())),
  })).filter(item => item.hits.length > 0).sort((a, b) => b.hits.length - a.hits.length);
  if (!ranked[0]) return null;
  return { figure, ...ranked[0], reason: "问题涉及：" + ranked[0].hits.join("、") };
}
