import xlwings as xw
from datetime import date, timedelta, datetime  # 加這行！
import random
import requests
from bs4 import BeautifulSoup

app = xw.App(visible=True)
wb = app.books.open('Roster template.xlsx')
master = wb.sheets['(Step 2 update year)Master']
stat = wb.sheets['(Step 1 update names )stat']  # Stat sheet
ph_sheet = wb.sheets['Step 3 update PH']

# 先試讀 Master B1 的年份
b1_value = master.range('B1').value
if b1_value and isinstance(b1_value, (int, float)) and b1_value > 2000:
    year = int(b1_value)
    print(f"讀到 Excel B1 年份: {year}")
else:
    # B1 沒年份或錯，就問你輸入
    while True:
        try:
            year = int(input(f"Excel B1 沒年份或錯，請輸入年份 (例如 2026): ").strip())
            if year > 2000:
                # 順便寫回 B1，方便下次自動讀
                master.range('B1').value = year
                print(f"已填年份 {year} 到 B1")
                break
        except:
            print("請輸入正確數字")




# 自動從 Stat sheet T column 讀員工名字，U column 檢查是否可以 on call
staff = []
row = 3  # 從 T3 開始讀
while True:
    name_cell = stat.range(f'T{row}').value
    can_on_call_cell = stat.range(f'U{row}').value  # U column 檢查是否可以 on call
    
    if name_cell is None or name_cell == '':
        break  # 讀到空白停止
    
    name_str = str(name_cell).strip()
    # U column 有內容才加入（假設有寫 "Yes" 或任何標記表示可以 on call）
    if can_on_call_cell is not None and can_on_call_cell != '':
        staff.append(name_str)
        print(f"加入可以 on call 的員工: {name_str}")
    else:
        print(f"跳過不能 on call 的員工: {name_str}")
    
    row += 1

n_staff = len(staff)

print(f"\n總共 {n_staff} 位可以 on call 的員工：")
print(staff)

# 行位置
date_rows = [3, 12, 21, 30, 39, 48, 57, 66, 75, 84, 93, 102]
name_rows = [r + 2 for r in date_rows]
al_rows   = [r + 6 for r in date_rows]

# 讀日期位置
month_date_map = []
for m in range(12):
    row = date_rows[m]
    col = 2
    month_dict = {}
    while True:
        val = master.range((row, col)).value
        if val is None or val == '':
            break
        if isinstance(val, (int, float)):
            py_date = date(1899, 12, 30) + timedelta(days=int(val))
        elif isinstance(val, datetime):
            py_date = val.date()
        else:
            col += 1
            continue
        month_dict[py_date] = (m, col)
        col += 1
    month_date_map.append(month_dict)

# 讀 AL
al_dates_staff = {}
for m in range(12):
    row = al_rows[m]
    col = 2
    while True:
        name = master.range((row, col)).value
        date_val = master.range((date_rows[m], col)).value
        if date_val is None or date_val == '':
            break
        if name is None:
            col += 1
            continue
        if isinstance(date_val, (int, float)):
            py_date = date(1899, 12, 30) + timedelta(days=int(date_val))
        elif isinstance(date_val, datetime):
            py_date = date_val.date()
        else:
            col += 1
            continue
        name_str = str(name).strip()
        if name_str in staff:
            al_dates_staff.setdefault(py_date, []).append(name_str)
        col += 1

# 清空舊人名
for m in range(12):
    if month_date_map[m]:
        cols = [c for _, c in month_date_map[m].values()]
        if cols:
            s_col = min(cols)
            e_col = max(cols)
            s_let = xw.utils.col_name(s_col)
            e_let = xw.utils.col_name(e_col)
            for r in range(3):
                master.range(f'{s_let}{name_rows[m] + r}:{e_let}{name_rows[m] + r}').clear_contents()

# 讀 PH
ph_sheet = wb.sheets['Step 3 update PH']
ph_dates = []
for i in range(2, 29):
    val = ph_sheet.range(f'A{i}').value
    if val:
        if isinstance(val, (int, float)):
            ph_dates.append(date(1899, 12, 30) + timedelta(days=int(val)))
        elif isinstance(val, datetime):
            ph_dates.append(val.date())


print(f"總共讀到 {len(ph_dates)} 個 PH")
if len(ph_dates) == 0:
    print("警告：沒讀到任何 PH，請檢查 PH sheet A 列是否有日期")

# 建立所有星期
weeks_list = []
first_start = date(year, 1, 1)
first_end = date(year, 1, 4)
ph_in_first = sum(1 for d in ph_dates if first_start <= d <= first_end)
weeks_list.append((first_start, first_end, ph_in_first, ph_in_first > 0))

current = date(year, 1, 5)
while current.year == year:
    start = current
    end = current + timedelta(days=6)
    if end.year > year:
        break
    ph_in = sum(1 for d in ph_dates if start <= d <= end)
    weeks_list.append((start, end, ph_in, ph_in > 0))
    current = end + timedelta(days=1)

ph_weeks = [w for w in weeks_list if w[3]]
normal_weeks = [w for w in weeks_list if not w[3]]

# 分配
assigned = {}
ph_assigned = {s: 0 for s in staff}
oncall_weeks = {s: 0 for s in staff}

def can_assign_week(person, start, end):
    days = (end - start).days + 1
    for offset in range(days):
        d = start + timedelta(days=offset)
        if d in al_dates_staff and person in al_dates_staff[d]:
            return False
    return True

# 第一階段：PH平均分配（支援任意員工數）
total_ph_days = len(ph_dates) * 3  # 總 PH 天數
ph_per_person = total_ph_days // n_staff
extra_ph = total_ph_days % n_staff

target_ph_dict = {}
for i, s in enumerate(staff):
    target_ph_dict[s] = ph_per_person + 1 if i < extra_ph else ph_per_person

print("每人 PH 目標：")
for s in staff:
    print(f"{s}: {target_ph_dict[s]} 天")

ph_weeks_all = ph_weeks.copy()
if ph_in_first > 0:
    ph_weeks_all = [(first_start, first_end, ph_in_first)] + ph_weeks_all

ph_weeks_all.sort(key=lambda w: w[2], reverse=True)

for week in ph_weeks_all:
    start, end, ph_in = week[0], week[1], week[2]
    candidates = [(ph_assigned[s], s) for s in staff if can_assign_week(s, start, end) and ph_assigned[s] + ph_in <= target_ph_dict[s]]
    if len(candidates) < 3:
        candidates = [(ph_assigned[s], s) for s in staff if can_assign_week(s, start, end)]
    candidates.sort()
    selected = [s for _, s in candidates[:3]]
    assigned[start] = selected
    for s in selected:
        ph_assigned[s] += ph_in
        oncall_weeks[s] += 1
# 填名字
def fill_week(selected, start, end):
    d = start
    while d <= end:
        for m_dict in month_date_map:
            if d in m_dict:
                m, col = m_dict[d]
                let = xw.utils.col_name(col)
                for i, p in enumerate(selected):
                    master.range(f'{let}{name_rows[m] + i}').value = p
                break
        d += timedelta(days=1)

for start, selected in assigned.items():
    end = next(w[1] for w in weeks_list if w[0] == start)
    fill_week(selected, start, end)

# 掃描實際 on call 週數（以星期日計）
def scan_actual_oncall_weeks(person):
    count = 0
    for week in weeks_list:
        start, end, _, _ = week
        sunday = end  # 星期日是週的結束日
        found = False
        for m_dict in month_date_map:
            if sunday in m_dict:
                m, col = m_dict[sunday]
                let = xw.utils.col_name(col)
                for i in range(3):
                    name = master.range(f'{let}{name_rows[m] + i}').value
                    if name and str(name).strip() == person:
                        count += 1
                found = True
                break
    return count


# 第一階段實際掃描驗算
actual_ph_weeks = {s: 0 for s in staff}
actual_ph_days = {s: 0 for s in staff}

for week in weeks_list:
    start, end, ph_in, is_ph = week
    if not is_ph:
        continue
    sunday = end
    found = False
    for m_dict in month_date_map:
        if sunday in m_dict:
            m, col = m_dict[sunday]
            let = xw.utils.col_name(col)
            names = []
            for i in range(3):
                name = master.range(f'{let}{name_rows[m] + i}').value
                if name:
                    name_str = str(name).strip()
                    if name_str in staff:
                        names.append(name_str)
            for name in names:
                actual_ph_weeks[name] += 1
                actual_ph_days[name] += ph_in
            found = True
            break

print("\n=== 第一階段實際掃描驗算（以星期日計） ===")
for s in staff:
    print(f"{s}: {actual_ph_weeks[s]} PH週, {actual_ph_days[s]} PH天")

wb.save()

answer = input("\n要繼續安排剩餘星期嗎？ (y/n): ").strip().lower()
if answer not in ['y', 'yes']:
    print("停止")
    wb.close()
    app.quit()
    exit()



# 第二階段：動態分組 + AL 前後優先 + 嚴格避開 AL + 不覆蓋 + 均勻分布 + 不連續 on call
print("\n=== 第二階段開始：動態分組安排 normal week ===")

# 目標週數（自動調整）
total_target = 52 * 3 // n_staff

# 動態分組（每組最多3人）
group_size = 3
groups = []
for i in range(0, n_staff, group_size):
    groups.append(staff[i:i + group_size])

print(f"動態分組（每組最多 {group_size} 人，共 {len(groups)} 組）:")
for i, g in enumerate(groups):
    print(f"組 {i+1}: {', '.join(g)}")

# 目前每人 on call 週數（用於選最少的人 + 判斷達標）
oncall_weeks = {s: 0 for s in staff}

# 檢查某週是否已有該人（用於避免連續 on call）
def has_person_in_week(person, start):
    end = start + timedelta(days=6)
    for d in range(7):
        check_date = start + timedelta(days=d)
        for m_dict in month_date_map:
            if check_date in m_dict:
                m, col = m_dict[check_date]
                let = xw.utils.col_name(col)
                for i in range(3):
                    name = master.range(f'{let}{name_rows[m] + i}').value
                    if name and str(name).strip() == person:
                        return True
                break
    return False

# 檢查週是否可加人（不覆蓋、不滿3人）
def week_available(start):
    if start not in assigned:
        return True
    current = assigned[start]
    if len(current) >= 3:
        return False
    return True

# 先把每個人的 AL 區塊合併（處理連續 AL）
person_al_blocks = {s: [] for s in staff}
for person in staff:
    al_dates = sorted([d for d in al_dates_staff if person in al_dates_staff[d]])
    if not al_dates:
        continue
    
    blocks = []
    current_block = [al_dates[0]]
    for i in range(1, len(al_dates)):
        if al_dates[i] <= current_block[-1] + timedelta(days=13):  # 兩週內視為同一區塊
            current_block.append(al_dates[i])
        else:
            blocks.append(current_block)
            current_block = [al_dates[i]]
    blocks.append(current_block)
    person_al_blocks[person] = blocks

# 安排 AL 前後 on call
for person in staff:
    blocks = person_al_blocks[person]
    for block in blocks:
        # 找 AL 區塊的第一週和最後一週
        first_al_date = block[0]
        last_al_date = block[-1]
        
        # 找第一週和最後一週的星期範圍
        first_week = None
        last_week = None
        for week in weeks_list:
            start, end, _, _ = week
            if start <= first_al_date <= end:
                first_week = (start, end)
            if start <= last_al_date <= end:
                last_week = (start, end)
        
        if not first_week or not last_week:
            continue
        
        # AL 前一週（只用第一週的前一週）
        prev_start = first_week[0] - timedelta(days=7)
        if prev_start >= date(year, 1, 1):
            if week_available(prev_start):
                if prev_start not in assigned:
                    assigned[prev_start] = []
                if person not in assigned[prev_start]:
                    assigned[prev_start].append(person)
                    fill_week(assigned[prev_start], prev_start, prev_start + timedelta(days=6))
                    oncall_weeks[person] += 1
        
        # AL 後一週（只用最後一週的後一週）
        next_start = last_week[1] + timedelta(days=1)
        if next_start <= date(year, 12, 31):
            next_end = next_start + timedelta(days=6)
            if next_end.year <= year and week_available(next_start):
                if next_start not in assigned:
                    assigned[next_start] = []
                if person not in assigned[next_start]:
                    assigned[next_start].append(person)
                    fill_week(assigned[next_start], next_start, next_end)
                    oncall_weeks[person] += 1

wb.save()

# 2. 正常週分配：用第一階段邏輯 + 嚴格不連續 on call
print("\n開始分配 normal week（選週數最少 + 不連續 on call）")

# normal_weeks 從早到晚排序（均勻分布）
normal_weeks.sort(key=lambda w: w[0])

for week in normal_weeks:
    start, end, _, _ = week

    # 檢查這週已有幾人
    current_count = 0
    if start in assigned:
        current_count = len(assigned[start])
    need = 3 - current_count
    if need <= 0:
        continue

    # 選候補：週數最少 + 上週 off + 能排（避開 AL）
    candidates = []
    for s in staff:
        if oncall_weeks[s] >= total_target:
            continue  # 已達標不排
        if not can_assign_week(s, start, end):
            continue
        if start in assigned and s in assigned[start]:
            continue  # 已排過

        # 上週是否 on call
        prev_start = start - timedelta(days=7)
        prev_on = False
        if prev_start in assigned and s in assigned[prev_start]:
            prev_on = True

        penalty = 100 if prev_on else 0  # 上週 on 的懲罰高
        candidates.append((oncall_weeks[s] + penalty, oncall_weeks[s], s))

    candidates.sort()  # 週數最少 + 上週 off 優先
    selected = []
    for _, _, s in candidates:
        if len(selected) >= need:
            break
        selected.append(s)

    if start not in assigned:
        assigned[start] = []
    for s in selected:
        assigned[start].append(s)
        oncall_weeks[s] += 1

    fill_week(assigned[start], start, end)

# 年尾最後幾天
last_week_end = max(w[1] for w in weeks_list)
remaining_start = last_week_end + timedelta(days=1)
remaining_end = date(year, 12, 31)
if remaining_start <= remaining_end:
    selected = sorted(staff, key=lambda s: actual_ph_days[s])[:3]
    fill_week(selected, remaining_start, remaining_end)


answer = input("要找出連續on call嗎？ (y/n): ").strip().lower()
if answer not in ['y', 'yes']:
    print("停止")
    wb.close()
    app.quit()
    exit()


# 第三階段：掃描連續 on call 並標記
print("\n=== 第三階段：掃描連續 on call 並標記 ===")

# 先找出所有有 PH 的週（PH week）
ph_week_starts = set()
for week in weeks_list:
    start, end, ph_in, is_ph = week
    if is_ph:
        ph_week_starts.add(start)

# 掃描每位員工的 on call 情況
marked = []  # 儲存標記的 (員工, 連續週開始日期列表)

for person in staff:
    consecutive_weeks = []  # 連續 on call 的週開始日期
    current_consec = []

    for week in weeks_list:
        start, end, ph_in, is_ph = week
        sunday = end
        found = False
        is_on = False
        for m_dict in month_date_map:
            if sunday in m_dict:
                m, col = m_dict[sunday]
                let = xw.utils.col_name(col)
                for i in range(3):
                    name = master.range(f'{let}{name_rows[m] + i}').value
                    if name and str(name).strip() == person:
                        is_on = True
                found = True
                break
        
        if is_on:
            current_consec.append(start)
        else:
            if len(current_consec) >= 2:
                consecutive_weeks.append(current_consec[:])
            current_consec = []

    if len(current_consec) >= 2:
        consecutive_weeks.append(current_consec)

    # 對每個連續區段判斷規則
    for consec in consecutive_weeks:
        if len(consec) == 2:
            week1, week2 = consec[0], consec[1]
            # 第1種：兩個普通週，但靠近 AL
            if week1 not in ph_week_starts and week2 not in ph_week_starts:
                # 檢查是否在 AL 之後兩週內
                near_al = False
                for al_date in [d for d in al_dates_staff if person in al_dates_staff[d]]:
                    al_week_start = None
                    for w in weeks_list:
                        if w[0] <= al_date <= w[1]:
                            al_week_start = w[0]
                            break
                    if al_week_start and week1 <= al_week_start + timedelta(days=14):
                        near_al = True
                        break
                if near_al:
                    continue  # 無動作

                # 第2種：兩個普通週，前後無 AL
                marked.append((person, [week1, week2]))
                print(f"標記 {person} 連續2週普通 on call: {week1} ~ {week2}")

            # 第3種：PH week 橫跨導致連續，無動作
            elif week1 in ph_week_starts or week2 in ph_week_starts:
                continue

        elif len(consec) == 3:
            week1, week2, week3 = consec[0], consec[1], consec[2]
            # 第4種：連續3週普通週
            if all(w not in ph_week_starts for w in consec):
                marked.append((person, consec))
                print(f"標記 {person} 連續3週普通 on call: {week1} ~ {week3}")

            # 第5種：連續3週，中間夾 PH week
            elif week2 in ph_week_starts:
                marked.append((person, consec))
                print(f"標記 {person} 連續3週 (中間夾 PH): {week1} ~ {week3}")

# 顯示所有標記
print("\n=== 標記總結 ===")
if marked:
    for person, weeks in marked:
        print(f"{person} 標記連續週: {', '.join(str(w) for w in weeks)}")
else:
    print("沒有發現需要標記的連續 on call")

wb.save()


# 最終統計（掃描實際週數）
def scan_actual_oncall_weeks(person):
    count = 0
    for week in weeks_list:
        start, end, _, _ = week
        sunday = end
        found = False
        for m_dict in month_date_map:
            if sunday in m_dict:
                m, col = m_dict[sunday]
                let = xw.utils.col_name(col)
                for i in range(3):
                    name = master.range(f'{let}{name_rows[m] + i}').value
                    if name and str(name).strip() == person:
                        count += 1
                found = True
                break
    return count

print("\n=== 最終統計 ===")
for s in staff:
    final_weeks = scan_actual_oncall_weeks(s)
    print(f"{s}: {final_weeks} 週")

wb.save()
print("\n完成！")


