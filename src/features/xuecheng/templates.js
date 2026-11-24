/**
 * 模板市场 —— 内置多套常用文档模板
 * 每个模板的 build() 返回 ProseMirror doc 的 JSON，与 schema.starterDoc() 同构。
 */
import { schema } from "./schema.js";

const n = schema.nodes;
const t = (text, marks) => (text ? schema.text(text, marks || undefined) : null);

/** 段落（可传单个节点、富文本数组或 null；自动滤除空文本节点） */
const p = (content) => {
  if (content == null) return n.paragraph.create(null);
  const arr = Array.isArray(content) ? content : [content];
  return n.paragraph.create(null, arr.filter(Boolean));
};
/** 标题 */
const h = (level, text) => n.heading.create({ level }, t(text));
/** 带 mark 的文本片段 */
const rich = (text, markName) => t(text, [schema.marks[markName].create()]);
/** 无序列表（items 为字符串数组） */
const bullet = (items) =>
  n.bullet_list.create(null, items.map((it) => n.list_item.create(null, p(t(it)))));
/** 任务清单 */
const tasks = (items, checked = false) =>
  n.task_list.create(
    null,
    items.map((it) => n.task_item.create({ checked }, p(t(it))))
  );
/** 提示块 */
const callout = (type, text) => n.callout.create({ type }, p(t(text)));
/** 表格：headers 为列标题数组，rows 为二维数组（按列数对齐，缺的补空单元格）
 *  每列预先写入 colwidth（prosemirror-tables 要求是数组），编辑时拖列宽不会「连累」其他列 */
const COL_W = 940;
const table = (headers, rows) => {
  const w = Math.max(40, Math.floor(COL_W / headers.length));
  const cell = (type, text) => type.create({ colwidth: [w] }, p(t(text)));
  return n.table.create(null, [
    n.table_row.create(null, headers.map((hd) => cell(n.table_header, hd))),
    ...rows.map((row) =>
      n.table_row.create(null, headers.map((_, i) => cell(n.table_cell, row[i] ?? "")))
    ),
  ]);
};
/** 两列表格（兼容既有写法） */
const table2 = (headerA, headerB, rows) => table([headerA, headerB], rows.map((r) => [r[0], r[1]]));
/** hr */
const hr = () => n.horizontal_rule.create();

const BUILTIN = [
  {
    id: "meeting",
    name: "会议纪要",
    desc: "记录会议主题、参会人、决议与待办，开完会直接归档。",
    icon: "📝",
    accent: "#2f6fed",
    build: () =>
      n.doc.create(null, [
        h(1, "会议纪要"),
        p([rich("会议主题：", "strong"), t("")]),
        p([rich("时间：", "strong"), t(""), rich("  地点：", "strong"), t("")]),
        p([rich("参会人：", "strong"), t("")]),
        hr(),
        h(2, "议题与讨论"),
        bullet(["议题一：", "议题二：", "议题三："]),
        h(2, "会议决议"),
        p(t("记录本次会议达成的关键结论……")),
        h(2, "行动项（待办）"),
        tasks(["负责人 / 截止日期：待办一", "负责人 / 截止日期：待办二"], false),
        callout("info", "下次会议时间待定，由主持人另行通知。"),
      ]).toJSON(),
  },
  {
    id: "weekly",
    name: "工作周报",
    desc: "本周完成、进行中、下周计划三栏，向上级同步进度。",
    icon: "📊",
    accent: "#0f9d6b",
    build: () =>
      n.doc.create(null, [
        h(1, "工作周报"),
        p([rich("汇报人：", "strong"), t(""), rich("  周期：", "strong"), t("YYYY-MM-DD ~ YYYY-MM-DD")]),
        hr(),
        h(2, "本周完成"),
        tasks(["完成事项一", "完成事项二", "完成事项三"], true),
        h(2, "进行中"),
        tasks(["事项一（进度 60%）", "事项二（进度 30%）"], false),
        h(2, "下周计划"),
        bullet(["计划一", "计划二", "计划三"]),
        h(2, "风险与需要的支持"),
        p(t("描述当前卡点与需要协调的资源……")),
      ]).toJSON(),
  },
  {
    id: "project",
    name: "项目计划",
    desc: "目标、里程碑、分工与排期，适合启动一个新项目。",
    icon: "🗂️",
    accent: "#7a4ddb",
    build: () =>
      n.doc.create(null, [
        h(1, "项目计划：项目名称"),
        p([rich("负责人：", "strong"), t(""), rich("  成员：", "strong"), t("")]),
        callout("success", "一句话目标：用一句话说清这个项目要解决的问题。"),
        h(2, "范围与交付物"),
        bullet(["交付物一", "交付物二", "不在范围内的事（排除项）"]),
        h(2, "里程碑排期"),
        table2(
          "里程碑",
          "时间 / 负责人",
          [
            ["需求确认", "W1 / 张三"],
            ["开发完成", "W3 / 李四"],
            ["上线发布", "W4 / 王五"],
          ]
        ),
        h(2, "风险"),
        bullet(["风险一与应对", "风险二与应对"]),
      ]).toJSON(),
  },
  {
    id: "reading",
    name: "读书笔记",
    desc: "书摘、感悟与行动点，把读过的书变成自己的知识。",
    icon: "📚",
    accent: "#e8833a",
    build: () =>
      n.doc.create(null, [
        h(1, "《书名》读书笔记"),
        p([rich("作者：", "strong"), t(""), rich("  评分：", "strong"), t("⭐⭐⭐⭐")]),
        hr(),
        h(2, "核心观点"),
        bullet(["观点一", "观点二", "观点三"]),
        h(2, "金句摘录"),
        callout("info", "“在这里粘贴让你印象最深的原句。”"),
        h(2, "我的感悟"),
        p(t("写下这本书对你思维方式或工作的启发……")),
        h(2, "可落地的行动"),
        tasks(["行动一", "行动二"], false),
      ]).toJSON(),
  },
  {
    id: "prd",
    name: "产品需求文档",
    desc: "背景、用户故事、功能列表与验收标准，研发对齐的基线。",
    icon: "📐",
    accent: "#d6336c",
    build: () =>
      n.doc.create(null, [
        h(1, "PRD：功能名称"),
        p([rich("版本：", "strong"), t("v1.0"), rich("  作者：", "strong"), t(""), rich("  状态：", "strong"), t("草稿")]),
        h(2, "一、背景与目标"),
        p(t("为什么要做这个功能？要解决用户的什么痛点？")),
        h(2, "二、用户故事"),
        bullet([
          "作为<角色>，我希望<能力>，以便<价值>。",
          "作为<角色>，我希望<能力>，以便<价值>。",
        ]),
        h(2, "三、功能需求"),
        table2(
          "功能点",
          "说明 / 优先级",
          [
            ["功能一", "描述 + P0"],
            ["功能二", "描述 + P1"],
          ]
        ),
        h(2, "四、验收标准"),
        tasks(["给定<前置条件>，当<操作>，则<预期结果>", "边界与异常场景覆盖"], false),
        callout("warning", "数据口径与埋点需求需与数据同学提前对齐。"),
      ]).toJSON(),
  },
  {
    id: "resume",
    name: "简历",
    desc: "个人信息、教育、工作经历与项目亮点，快速搭建一页简历。",
    icon: "👤",
    accent: "#1170cf",
    build: () =>
      n.doc.create(null, [
        h(1, "姓名 · 应聘岗位"),
        p([rich("电话：", "strong"), t(""), rich("  邮箱：", "strong"), t(""), rich("  城市：", "strong"), t("")]),
        hr(),
        h(2, "教育经历"),
        bullet(["学校 · 专业 · 学历（起止时间）", "主修课程 / GPA / 荣誉"]),
        h(2, "工作经历"),
        bullet([
          "公司 · 岗位（起止时间）— 用数据说明贡献",
          "公司 · 岗位（起止时间）— 用数据说明贡献",
        ]),
        h(2, "项目亮点"),
        bullet(["项目一：做了什么、带来什么结果", "项目二：做了什么、带来什么结果"]),
        h(2, "技能"),
        p(t("列出与岗位相关的核心技能关键词。")),
      ]).toJSON(),
  },
  {
    id: "todo",
    name: "待办清单",
    desc: "今天 / 本周要事，勾选完成，清爽不焦虑。",
    icon: "✅",
    accent: "#0f9d6b",
    build: () =>
      n.doc.create(null, [
        h(1, "待办清单"),
        callout("info", "建议先把最重要的一件事放在最前面。"),
        h(2, "今天"),
        tasks(["要事一", "要事二", "要事三"], false),
        h(2, "本周"),
        tasks(["事项一", "事项二"], false),
        h(2, " someday / 想做"),
        bullet(["灵感一", "灵感二"]),
      ]).toJSON(),
  },
  {
    id: "travel",
    name: "旅行计划",
    desc: "行程、预算、行李与注意事项，出门前一站式准备。",
    icon: "✈️",
    accent: "#1aa7c0",
    build: () =>
      n.doc.create(null, [
        h(1, "旅行计划：目的地"),
        p([rich("出发：", "strong"), t(""), rich("  返程：", "strong"), t(""), rich("  人数：", "strong"), t("")]),
        callout("success", "一句话期待：这次旅行最想体验的是什么？"),
        h(2, "行程安排"),
        table(
          ["日期", "行程", "住宿"],
          [
            ["Day 1", "抵达 + 市区", "酒店 A"],
            ["Day 2", "景点一 + 景点二", "酒店 A"],
            ["Day 3", "周边游", "酒店 B"],
          ]
        ),
        h(2, "预算"),
        table2(
          "类别",
          "预估金额",
          [
            ["交通", "¥ ——"],
            ["住宿", "¥ ——"],
            ["餐饮", "¥ ——"],
            ["门票 / 其他", "¥ ——"],
          ]
        ),
        h(2, "行李清单"),
        tasks(["证件 / 充电器", "衣物", "常用药品"], false),
        h(2, "注意事项"),
        bullet(["当地天气与穿衣建议", "紧急联系电话", "网络 / 换汇"]),
      ]).toJSON(),
  },
];

/** 内置模板（统一打上 builtin 标记，前端据此隐藏「删除」并显示对应角标） */
export const TEMPLATES = BUILTIN.map((tpl) => ({ ...tpl, builtin: true }));
