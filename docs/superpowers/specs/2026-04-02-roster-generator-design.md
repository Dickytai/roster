# 护士排班生成器 - 设计规格书

## 概述

**项目名称**: Nurse Roster Generator
**类型**: Vercel Web Application
**功能**: 自动生成全年护士值班排班表（On-call Schedule）和员工更表（Roster）
**用户**: 诊所/医院管理人员

## 用户需求

### 输入
1. 年份（默认当前年份）
2. 公众假期列表（支持香港2026年预设）
3. 员工名单（姓名、职位、是否可上on-call）
4. 每位员工年度假期(AL)安排

### 输出
1. 全年 On-call Schedule（每人每周分配）
2. 全年员工更表（12个月各员工的班次）
3. On-call 统计报表
4. 下载格式: Excel + PDF

## 排班规则

### 核心约束
- 每周需要3人 on-call
- 每人每年 on-call 次数尽量平均
- 不能在员工年假(AL)期间安排 on-call
- 避免连续周 on-call（同一人）
- 公众假期(PH)优先分配

### 班次类型（完整版）
| 代码 | 类型 | 时间 |
|------|------|------|
| B, B1-B6 | 日班 | 08:00-17:35 各时段 |
| D, D1-D3 | 早班 | 08:30-18:00 各时段 |
| E, E1 | 晚班 | 10:30-19:00 |
| L | 夜班 | 08:30-19:30 |
| HD, HD1-HD4 | 半日班 | 各时段 |
| AL | 年假 | - |
| SL | 病假 | - |
| PH | 公众假期 | - |
| SD | 学习日 | - |
| DO | 休息日 | - |

### 员工类型
- GM (General Manager)
- SNO (Senior Nursing Officer)
- RN (Registered Nurse)
- CA (Clinic Assistant)
- SSA (Support Service Staff)

## 系统架构

```
┌─────────────────────────────────────────┐
│           React Frontend (Vercel)        │
│  Step 1: 年份 + PH  │  Step 2: 员工+AL │
│  Step 3: 预览生成   │  Result: 下载     │
└─────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────┐
│      Vercel Serverless Functions         │
│  /api/generate - 排班算法               │
│  /api/download/excel - 生成Excel         │
│  /api/download/pdf - 生成PDF            │
└─────────────────────────────────────────┘
```

## 页面设计

### Step 1: 基本设置
- 年份输入框（默认2026）
- 公众假期选择（预设香港2026 / 手动添加）
- 显示假期列表（可删除）

### Step 2: 员工与年假
- 添加员工表单（姓名、职位、on-call权限）
- 员工列表（显示已添加人员）
- 选择员工后添加AL日期范围
- 显示每位员工的AL日期

### Step 3: 预览与确认
- On-call 统计预览（每人分配天数）
- 每月排班预览（简化表格）
- "生成排班表" 按钮

### Result: 下载
- Excel 下载按钮
- PDF 下载按钮
- 重新编辑选项

## 界面风格

- **风格**: 简洁现代，类似 Notion/Linear
- **主色调**: 灰白 + 蓝绿点缀
- **布局**: 步骤式向导，卡片式设计
- **响应式**: 支持桌面和移动设备

## 技术栈

| 组件 | 技术 |
|------|------|
| 前端框架 | React 18 + Vite |
| 样式 | Tailwind CSS |
| 状态管理 | React useState/useReducer |
| API | Vercel Serverless Functions |
| Excel生成 | SheetJS (xlsx) |
| PDF生成 | pdfmake |

## 数据结构

### 员工 (Staff)
```typescript
interface Staff {
  id: string;
  name: string;           // e.g., "Chan, Man Wai"
  shortName: string;      // e.g., "Ivy"
  position: 'GM' | 'SNO' | 'RN' | 'CA' | 'SSA' | 'Radiographer';
  canOnCall: boolean;
  alRanges: DateRange[];  // 年假日期范围
}
```

### 公众假期 (PublicHoliday)
```typescript
interface PublicHoliday {
  date: string;           // YYYY-MM-DD
  name: string;           // e.g., "元旦 (New Year's Day)"
  nameZh: string;
}
```

### 排班结果 (RosterResult)
```typescript
interface RosterResult {
  year: number;
  onCallSchedule: OnCallWeek[];
  monthlyRosters: MonthlyRoster[];
  statistics: StaffStatistics[];
}

interface OnCallWeek {
  weekStart: Date;
  weekEnd: Date;
  staff: string[];        // 3人 on-call
  isPhWeek: boolean;
  phDays: number;
}

interface MonthlyRoster {
  month: number;          // 1-12
  days: DayRoster[];
}

interface DayRoster {
  date: string;
  dayOfWeek: string;
  isPh: boolean;
  isSunday: boolean;
  shifts: {
    [staffId: string]: string;  // 班次代码
  };
}
```

## 排班算法（详细）

### 基础定义

**周的定义**：
- 周从星期一开始，到星期日结束
- 星期日视为一周的结束日
- 全年约52周

**数据结构**：
```typescript
// 周列表
interface Week {
  start: Date;      // 周一
  end: Date;         // 周日
  phDays: number;    // 周内PH天数
  isPhWeek: boolean; // 是否为PH周（含任何PH）
}

// 员工AL日期
interface ALDate {
  date: Date;
  staffId: string;
}

// AL区块（合并连续AL）
interface ALBlock {
  staffId: string;
  startDate: Date;
  endDate: Date;
  dates: Date[];
}
```

### 第一阶段: PH周分配（公众假期优先）

**目标**：将PH天数平均分配给所有可on-call员工

**公式**：
- 每人目标PH天数 = floor(总PH天数 / 员工数)
- 剩余余数分配给排前面的员工

**算法步骤**：
```
1. 构建全年周列表（52-53周）
2. 识别所有PH周（week.isPhWeek = true）
3. 计算每人目标PH天数:
   total_ph_days = len(ph_dates) * 3  // 每PH一天算3天
   ph_per_person = total_ph_days // n_staff
   extra_ph = total_ph_days % n_staff
   前extra_ph个人多分配1天

4. 对每个PH周（按PH天数降序）:
   a. 找出可分配的候选人:
      - 该周不在AL
      - 分配后不超过目标PH天数
   b. 如果候选人<3人，放宽条件（只检查是否在AL）
   c. 按已分配PH天数升序选择3人
   d. 更新assigned[start]和ph_assigned
```

**示例**：假设有17个PH天，7名员工
- total_ph_days = 17 * 3 = 51
- ph_per_person = 51 // 7 = 7
- extra = 51 % 7 = 2
- 前2人目标8天，后5人目标7天

### 第二阶段: AL前后优先安排

**AL区块合并规则**：
- 连续AL或间隔在14天内的AL视为同一区块
- 同一区块只需要在前后各安排一次on-call

**算法步骤**：
```
1. 对每位员工:
   a. 收集所有AL日期
   b. 按日期排序
   c. 合并相邻/近的AL（间隔<=13天）
   d. 形成ALBlock列表

2. 对每个ALBlock:
   a. 找AL区块所在周的第一周和最后一周
   b. 在第一周的前一周安排on-call（如未满3人）
   c. 在最后一周的后一周安排on-call（如未满3人）
```

**注意**：
- 只在周未满3人时添加
- 添加后更新oncall_weeks计数
- 直接修改assigned和Excel

### 第三阶段: 普通周填充

**目标**：填充剩余周，使每人on-call次数尽量平均

**每人目标周数**：
```
total_target = 52 * 3 // n_staff
```

**候选人选择规则**（优先级从高到低）：
1. 未达目标周数
2. 该周不在AL期间
3. 不已在该周assigned
4. 上周不在on-call（避免连续）
5. 按已分配周数升序选择

**惩罚机制**：
```typescript
// 如果上周已on-call，增加惩罚值
penalty = prev_on ? 100 : 0
candidates.sort((a, b) => (a.oncall_weeks + a.penalty) - (b.oncall_weeks + b.penalty))
```

**算法步骤**：
```
1. 对每个普通周（按日期升序）:
   a. 检查该周已有几人
   b. 计算需要补充几人
   c. 遍历所有员工找候选人:
      - 未达目标
      - 该周可分配（不在AL）
      - 不已在该周
      - 应用惩罚机制
   d. 选择周数最少的前N人
   e. 更新assigned和oncall_weeks
   f. 写入Excel

2. 年尾处理（如有剩余天数）:
   a. 选择PH天数最少的前3人
   b. 填入剩余天
```

### 第四阶段: 连续On-call标记与处理

**扫描规则**：按星期日结束日扫描

**连续判定**：
```
扫描整个年度，对每个员工:
  追踪连续on-call的周列表
  如果周i的周日=周i+1的周一-1天，则是连续的
```

**5种连续情况处理**：

| 情况 | 描述 | 处理 |
|------|------|------|
| 情况1 | 连续2周普通周，且靠近AL | 无动作 |
| 情况2 | 连续2周普通周，前后无AL | 标记 |
| 情况3 | 含PH周导致的连续 | 无动作 |
| 情况4 | 连续3周普通周 | 标记 |
| 情况5 | 连续3周，中间夹PH周 | 标记 |

**标记逻辑**：
```typescript
if (consec.length === 2) {
  if (week1 not in ph_weeks && week2 not in ph_weeks) {
    // 情况1或2
    if (near_al(week1, al_dates)) {
      // 情况1：无动作
    } else {
      // 情况2：标记
    }
  }
  // 情况3：含PH，无动作
}

if (consec.length === 3) {
  if (all(w not in ph_weeks)) {
    // 情况4：标记
  } else if (week2 in ph_weeks) {
    // 情况5：标记
  }
}
```

### Excel 结构说明

### Master表结构（主表）

```
行号   内容
─────────────────────────────────────────────
B1     年份
3      一月日期（B3, C3, E3... 跳过周末）
4      星期几（TEXT公式）
5-7    一月on-call人员（3行 = 3人/天）
8      空行
9-11   二月on-call人员（或一月第二周）
...
```

**注意**：日期列不是连续的，跳过周末以减少列数

### 月份表（Jan, Feb, ...）

- 引用Master表的数据
- 使用IFERROR+IF公式处理空单元格
- 直接显示Master的日期和人员

### On-call统计表

**公式逻辑**：
```excel
=COUNTIF(Master!$B$4:$AG$7, B4)  // 统计某人在某月出现次数
=SUM(C4:N4)  // 某人全年on-call总天数
```

**列对应**：
- C-N: 12个月
- O: 年总计

### PH假期表

- A列: 假期日期（Excel日期序号）
- B列: 假期名称索引
- 共17个香港公众假期

### 排更规则（从Excel公式分析）

根据Excel模板分析，班次安排遵循以下规则：

#### 周末/假期班次安排

| 条件 | 人员 | 班次 |
|------|------|------|
| 星期日 | GM | HD（半日班） |
| 星期日 | SNO | HD |
| 星期日 | 特定人员（如Yoko） | HD1 |
| 星期六 | 逢PH | PH on Sat |

#### 特殊人员规则

| 人员 | 条件 | 班次 |
|------|------|------|
| Yoyo | 单数月 | D1 |
| Yoyo | 双数月 | B6 |
| Kathy | 单数月 | B6 |
| Kathy | 双数月 | D1 |
| 其他RN | 标准 | D |

#### On-call与班次的关系

- **On-call日**：整周显示on-call人员姓名
- **非On-call日**：根据人员类型和日期分配班次
- **PH**：显示"PH"标记

### 员工职位与班次映射

| 职位 | 代码 | 说明 |
|------|------|------|
| GM | GM | General Manager, 通常HD |
| SNO | SNO | Senior Nursing Officer |
| RN | RN | Registered Nurse |
| CA | CA | Clinic Assistant |
| SSA | SSA | Support Service Assistant |
| Radiographer | RAD | 放射技师 |

### 班次时间表

| 代码 | 类型 | 时间 |
|------|------|------|
| B | 日班 | 08:00-16:00 |
| B1 | 日班 | 08:00-16:15 |
| B2 | 日班 | 08:45-16:45 |
| B3 | 日班 | 08:35-17:35 |
| B4 | 日班 | 08:15-16:15 |
| B5 | 日班 | 08:00-17:00 |
| B6 | 日班 | 08:15-16:30 |
| D | 早班 | 09:00-17:00 |
| D1 | 早班 | 08:30-17:00 |
| D2 | 早班 | 08:30-17:30 |
| D3 | 早班 | 09:00-18:00 |
| E | 晚班 | 11:00-19:00 |
| E1 | 晚班 | 10:30-19:00 |
| L | 夜班 | 08:30-19:30 |
| HD | 半日 | 09:00-13:00 |
| HD1 | 半日 | 08:35-12:35 |
| HD2 | 半日 | 08:00-13:00 |
| HD3 | 半日 | 09:30-13:30 |
| HD4 | 半日 | 08:00-12:00 |
| AL | 年假 | - |
| SL | 病假 | - |
| PH | 公众假期 | - |
| SD | 学习日 | - |
| DO | 休息日 | - |
| CT | 补假 | - |

| 优先级 | 约束 | 说明 |
|--------|------|------|
| 1 | AL冲突 | 绝对不能在AL期间on-call |
| 2 | PH优先 | PH周优先分配on-call |
| 3 | 人数要求 | 每周必须3人 |
| 4 | 连续限制 | 避免连续on-call |
| 5 | 均匀分配 | 每人总天数尽量平均 |

### 周末/假期处理

- **星期六/日**：部分员工可能有不同的班次安排
- **PH（公众假期）**：
  - 整周标记为PH周
  - PH期间on-call有额外统计
- **周六逢PH**：特殊标记（见Excel中的"PH on Sat"）

## 文件结构

```
roster/
├── api/
│   ├── generate.ts        # 排班生成API
│   ├── excel.ts           # Excel下载API
│   └── pdf.ts             # PDF下载API
├── components/
│   ├── StepWizard.tsx      # 步骤向导容器
│   ├── Step1Basic.tsx     # 基本设置
│   ├── Step2Staff.tsx     # 员工与AL
│   ├── Step3Preview.tsx   # 预览确认
│   ├── Result.tsx         # 下载结果
│   ├── StaffForm.tsx      # 员工表单
│   ├── ALRangePicker.tsx  # AL日期选择
│   └── RosterPreview.tsx   # 排班预览
├── lib/
│   ├── rosterAlgorithm.ts # 排班算法
│   ├── excelGenerator.ts  # Excel生成器
│   ├── pdfGenerator.ts    # PDF生成器
│   └── holidays.ts         # 假期数据
├── types/
│   └── index.ts           # TypeScript类型
├── public/
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-04-02-roster-generator-design.md
├── vercel.json
└── package.json
```

## 香港2026年公众假期

| 日期 | 名称 |
|------|------|
| 2026-01-01 | 元旦 (New Year's Day) |
| 2026-01-29 | 農曆新年第一天 |
| 2026-01-30 | 農曆新年第二天 |
| 2026-01-31 | 農曆新年第三天 |
| 2026-04-03 | 耶穌受難節 (Good Friday) |
| 2026-04-04 | 受難節翌日 |
| 2026-04-06 | 清明節 (Ching Ming) |
| 2026-04-07 | 復活節星期一 (Easter Monday) |
| 2026-05-01 | 勞動節 (Labour Day) |
| 2026-05-02 | 佛誕翌日 |
| 2026-05-31 | 端午節 (Tuen Ng) |
| 2026-07-01 | 香港特區成立紀念日 |
| 2026-10-07 | 中秋節翌日 |
| 2026-10-08 | 國慶日 (National Day) |
| 2026-10-29 | 重陽節 (Chung Yeung) |
| 2026-12-25 | 聖誕節 (Christmas) |
| 2026-12-26 | 聖誕節翌日 |

## 验证方法

1. 使用香港2026年公众假期测试
2. 创建5-10名测试员工
3. 为每人添加2-4段AL
4. 生成排班表并验证:
   - 每人on-call天数相差不超过2天
   - 无人在AL期间on-call
   - 无连续周on-call（特殊情况除外）
   - 每周恰好3人

### 边界情况测试

| 情况 | 预期行为 |
|------|----------|
| 只有1-2人可on-call | 显示警告，生成不完整排班 |
| 大量PH重叠 | 优先分配到不同周 |
| AL跨年 | 正确处理年前年后的on-call |
| 年末不足7天 | 用剩余人员填充 |

## 待确认事项

- [x] 排班逻辑已在文档中详细描述
- [x] Excel结构已分析
- [x] 香港2026年公众假期已包含
- [ ] 是否需要用户登录/数据持久化？（暂不需要）
- [ ] 是否需要支持多语言（英文/中文）？
- [ ] 排更（班次分配）是否需要Web端编辑？
