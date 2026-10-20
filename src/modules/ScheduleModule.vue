<script setup>
import { ref, computed } from 'vue'
import {
  state, addLesson, updateLesson, removeLesson, setLessons, lessonsOn,
  todayStr, addDays, parseDate, weekday
} from '../store.js'
import BaseCard from '../components/BaseCard.vue'
import BaseButton from '../components/BaseButton.vue'
import BaseChip from '../components/BaseChip.vue'
import BaseNote from '../components/BaseNote.vue'

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const DAY_KEYS = { пн: 0, вт: 1, ср: 2, чт: 3, пт: 4, сб: 5, вс: 6 }
const DEFAULT_LINK = 'https://docs.google.com/spreadsheets/d/1GyQ6IklpcoT7Sir6C7rNU9aNErDX1HWBg7Y1EK5T-nA/edit'
const NET_ERROR = 'Не получилось открыть таблицу. Проверь, что она доступна по ссылке, или скачай её как CSV (Файл → Скачать → CSV) и загрузи файлом.'

const pad = n => String(n).padStart(2, '0')
const fmt = d => parseDate(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '')

function check(l) {
  if (!l.title.trim()) return 'Напиши название пары'
  if (!l.date) return 'Выбери дату'
  if (!(l.start < l.end)) return 'Конец пары должен быть позже начала'
  return ''
}

// ---------- неделя ----------

const weekStart = ref(addDays(todayStr(), -weekday(todayStr())))
const weekLabel = computed(() => `${fmt(weekStart.value)} – ${fmt(addDays(weekStart.value, 6))}`)
const week = computed(() =>
  Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart.value, i)
    return { date, lessons: lessonsOn(date) }
  }).filter(d => d.lessons.length)
)

function meta(l) {
  const place = [l.room, l.building].filter(Boolean).join(' ')
  return [l.kind, l.teacher, place].filter(Boolean).join(' · ')
}

const editId = ref(null)
const edit = ref(null)
const editError = ref('')

function startEdit(l) {
  editId.value = l.id
  edit.value = { ...l }
  editError.value = ''
}
function saveEdit() {
  const err = check(edit.value)
  if (err) { editError.value = err; return }
  updateLesson(editId.value, { ...edit.value, title: edit.value.title.trim() })
  editId.value = null
}
function remove(l) {
  if (confirm(`Удалить «${l.title}» ${fmt(l.date)}?`)) removeLesson(l.id)
}

// ---------- вручную ----------

const blank = () => ({ date: todayStr(), start: '08:00', end: '09:20', title: '', kind: '', teacher: '', room: '', building: '', until: '' })
const form = ref(blank())
const formError = ref('')

const overlap = computed(() => {
  const f = form.value
  if (!f.title.trim() || !f.date || !(f.start < f.end)) return null
  return lessonsOn(f.date).find(l => l.start < f.end && f.start < l.end) || null
})

function addManual() {
  const f = form.value
  const err = check(f)
  if (err) { formError.value = err; return }
  const { until, ...lesson } = f
  let d = f.date
  do {
    addLesson({ ...lesson, title: lesson.title.trim(), date: d })
    d = addDays(d, 7)
  } while (until && d <= until)
  weekStart.value = addDays(f.date, -weekday(f.date))
  form.value = { ...blank(), date: f.date, start: f.start, end: f.end }
  formError.value = ''
}

// ---------- разбор таблицы вуза ----------

// csv с кавычками и переносами строк внутри ячеек
function parseCsv(text) {
  const rows = []
  let row = [], cell = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (ch !== '\r') cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  return rows
}

// в таблице даты без года: сентябрь–декабрь это год начала учебного года, остальное следующий
function toDate(d, m) {
  const now = new Date()
  const y0 = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1
  const month = Number(m)
  return `${month >= 8 ? y0 : y0 + 1}-${pad(month)}-${pad(d)}`
}

// строка, где у каждой группы есть столбец «Ауд.»
function findGroups(table) {
  for (let h = 0; h < table.length; h++) {
    const row = table[h]
    const groups = []
    row.forEach((c, i) => {
      if (c.trim() && (row[i + 1] || '').trim().startsWith('Ауд')) groups.push({ name: c.trim(), col: i, headerRow: h })
    })
    if (groups.length) return groups
  }
  return []
}

// период модуля из заголовка, например «1 модуль (01.09. - 25.10.)»
function findPeriod(table) {
  for (const row of table.slice(0, 15)) {
    for (const c of row) {
      const m = c.match(/(\d{1,2})\.(\d{1,2})\.?\s*[-–]\s*(\d{1,2})\.(\d{1,2})/)
      if (m) return { start: toDate(m[1], m[2]), end: toDate(m[3], m[4]) }
    }
  }
  return { start: '', end: '' }
}

// «с 10.09.» значит каждую неделю начиная с этой даты до конца модуля
function parseSpecs(s, open) {
  return [...s.matchAll(/(\d{1,2})\.(\d{1,2})\.*(?:\s*[-–]\s*(\d{1,2})\.(\d{1,2}))?/g)]
    .map(m => ({ from: toDate(m[1], m[2]), to: m[3] ? toDate(m[3], m[4]) : null, open }))
}

function expand(specs, periodEnd) {
  return specs.flatMap(({ from, to, open }) => {
    const last = to || (open ? periodEnd : null)
    if (!last) return [from]
    const out = []
    for (let d = from; d <= last; d = addDays(d, 7)) out.push(d)
    return out
  })
}

function weekly(day, p) {
  if (!p.start || !p.end) return []
  let d = p.start
  while (weekday(d) !== day) d = addDays(d, 1)
  const out = []
  for (; d <= p.end; d = addDays(d, 7)) out.push(d)
  return out
}

// ячейку режем на куски по спискам дат: «08.09., 15.09. Предмет …», «14.09. Другой предмет …»
// кусок без дат значит «каждую неделю модуля»
function splitByDates(text) {
  const marks = [...text.matchAll(/(?:^|\s)((?:\d{1,2}\.\d{1,2}\.*\s*(?:[-–]\s*\d{1,2}\.\d{1,2}\.*)?\s*[,;]?\s*)+)/g)]
  const parts = []
  let pos = 0, specs = null
  for (const m of marks) {
    const at = m.index + m[0].indexOf(m[1])
    let before = text.slice(pos, at)
    const from = before.match(/(^|\s)с\s*$/i)
    if (from) before = before.slice(0, from.index)
    parts.push({ specs, text: before })
    specs = parseSpecs(m[1], !!from)
    pos = at + m[1].length
  }
  parts.push({ specs, text: text.slice(pos) })
  return parts.filter(p => p.text.trim())
}

const KIND = /^(лекция|семинар|практика|практическ\S* заняти\S*|лабораторн\S*( работ\S*)?)(\s*\(\d+\))?$/i
const PERSON = '[А-ЯЁ][а-яё-]+\\s+[А-ЯЁ]\\.\\s?([А-ЯЁ]\\.?)?'
const TEACHER = new RegExp(`^(${PERSON})(,\\s*${PERSON})*$|^Вакансия$`)

// «Предмет - вид - код - Преподаватель И.О.» → название, вид, преподаватель
function describe(text) {
  const parts = text.split(/\n|\s[-–]\s/).map(s => s.replace(/^[\s\-–]+|[\s\-–]+$/g, '')).filter(Boolean)
  let kind = '', teacher = ''
  const rest = []
  parts.forEach((p, i) => {
    if (!kind && KIND.test(p)) kind = p.replace(/\s*\(\d+\)$/, '').toLowerCase()
    else if (!teacher && TEACHER.test(p)) teacher = p
    // «Лобанов Павел»: имя полностью, последним куском
    else if (!teacher && i > 0 && i === parts.length - 1 && /^[А-ЯЁ][а-яё]+\s+[А-ЯЁ][а-яё]+$/.test(p)) teacher = p
    else if (/_/.test(p) && /\d/.test(p) && !/\s/.test(p)) return
    else if (!rest.includes(p)) rest.push(p)
  })
  return { title: rest.join(' - '), kind, teacher }
}

function parseCell(text, roomCell, buildingCell) {
  const lines = c => c.split('\n').map(s => s.trim()).filter(s => s && !/^-+$/.test(s))
  const rooms = lines(roomCell), buildings = lines(buildingCell)
  const entries = [], except = []
  let header = null
  // линия из дефисов делит ячейку на независимые занятия
  const pieces = text.split(/\n\s*-{3,}\s*\n/).flatMap(block => {
    const parts = splitByDates(block)
    if (parts.length) parts[0].fresh = true
    return parts
  })
  for (const p of pieces) {
    if (p.fresh) header = null
    if (/отмен/i.test(p.text)) {
      if (p.specs) except.push(...expand(p.specs))
      continue
    }
    const t = p.text.match(/^\s*в\s*(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})\s*/)
    const time = t ? { start: `${pad(t[1])}:${t[2]}`, end: `${pad(t[3])}:${t[4]}` } : null
    const rest = t ? p.text.slice(t[0].length) : p.text
    // «06.10. в 09:30-10:10» без названия: в эти даты предыдущая пара идёт в другое время
    if (time && !rest.trim()) {
      const prev = entries[entries.length - 1]
      if (prev && p.specs) prev.moved.push({ dates: expand(p.specs), ...time })
      continue
    }
    const d = describe(rest)
    // «Предмет - Препод» и ниже «06.10., 20.10. - лекция»: название берём сверху
    if (!d.title && header && p.specs) {
      header.children = true
      entries.push({ title: header.title, kind: d.kind || header.kind, teacher: d.teacher || header.teacher, specs: p.specs, time, moved: [] })
      continue
    }
    const e = { ...d, specs: p.specs, time, moved: [] }
    entries.push(e)
    if (d.title) header = e
  }
  return entries
    .filter(e => !(e.children && !e.specs))
    .map((e, i) => ({
      ...e,
      except,
      room: rooms[i] ?? rooms[rooms.length - 1] ?? '',
      building: buildings[i] ?? buildings[buildings.length - 1] ?? ''
    }))
}

function extract(table, group, period) {
  let dayCol = 1, timeCol = 2
  for (const r of table.slice(0, group.headerRow + 1)) {
    r.forEach((c, i) => {
      if (c.trim() === 'День') dayCol = i
      if (c.trim() === 'Время') timeCol = i
    })
  }
  const found = new Map()
  const skipped = []
  let day = null
  for (const r of table.slice(group.headerRow + 1)) {
    const key = (r[dayCol] || '').trim().slice(0, 2).toLowerCase()
    if (key in DAY_KEYS) day = DAY_KEYS[key]
    const t = (r[timeCol] || '').match(/(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/)
    const text = (r[group.col] || '').trim()
    if (day === null || !t || !text) continue
    const slot = { start: `${pad(t[1])}:${t[2]}`, end: `${pad(t[3])}:${t[4]}` }
    for (const e of parseCell(text, r[group.col + 1] || '', r[group.col + 2] || '')) {
      if (!e.title || /по расписанию дисциплин/i.test(e.title)) { skipped.push(e.title || text); continue }
      const put = (start, end, dates) => {
        if (!dates.length) return
        const k = [day, start, end, e.title, e.kind, e.teacher, e.room, e.building].join('|')
        if (!found.has(k)) {
          found.set(k, { id: k, day, start, end, title: e.title, kind: e.kind, teacher: e.teacher, room: e.room, building: e.building, dates: [] })
        }
        const p = found.get(k)
        p.dates = [...new Set([...p.dates, ...dates])].sort()
      }
      const base = e.time || slot
      const dates = (e.specs ? expand(e.specs, period.end) : weekly(day, period)).filter(d => !e.except.includes(d))
      const moved = e.moved.flatMap(m => m.dates)
      put(base.start, base.end, dates.filter(d => !moved.includes(d)))
      for (const m of e.moved) put(m.start, m.end, dates.filter(d => m.dates.includes(d)))
    }
  }
  const patterns = [...found.values()].sort((a, b) => a.day - b.day || a.start.localeCompare(b.start))
  return { patterns, skipped }
}

// ---------- загрузка ----------

const link = ref(DEFAULT_LINK)
const sheets = ref([])
const sheetGid = ref(null)
const table = ref(null)
const groups = ref([])
const group = ref(null)
const period = ref({ start: '', end: '' })
const loading = ref('')
const importError = ref('')

const sheetId = () => (link.value.match(/\/spreadsheets\/d\/([\w-]+)/) || [])[1]

function resetImport() {
  table.value = null
  groups.value = []
  group.value = null
  importError.value = ''
}

async function loadSheets() {
  resetImport()
  sheets.value = []
  sheetGid.value = null
  const id = sheetId()
  if (!id) { importError.value = 'Это не похоже на ссылку на Google-таблицу'; return }
  loading.value = 'Ищем курсы…'
  try {
    const html = await (await fetch(`https://docs.google.com/spreadsheets/d/${id}/htmlview`)).text()
    const all = [...html.matchAll(/\{name: "([^"]+)"[^}]*?gid: "(\d+)"/g)].map(m => ({ name: m[1], gid: m[2] }))
    const unique = all.filter((s, i) => all.findIndex(x => x.gid === s.gid) === i)
    const courses = unique.filter(s => /курс/i.test(s.name))
    sheets.value = courses.length ? courses : unique
    if (!sheets.value.length) importError.value = NET_ERROR
  } catch (e) {
    importError.value = NET_ERROR
  }
  loading.value = ''
}

async function pickSheet(s) {
  resetImport()
  sheetGid.value = s.gid
  loading.value = 'Загружаем расписание курса…'
  try {
    const r = await fetch(`https://docs.google.com/spreadsheets/d/${sheetId()}/export?format=csv&gid=${s.gid}`)
    if (!r.ok) throw new Error(r.status)
    useCsv(await r.text())
  } catch (e) {
    importError.value = NET_ERROR
  }
  loading.value = ''
}

async function pickFile(e) {
  const file = e.target.files[0]
  if (!file) return
  resetImport()
  sheets.value = []
  sheetGid.value = null
  useCsv(await file.text())
  e.target.value = ''
}

function useCsv(text) {
  const t = parseCsv(text)
  const g = findGroups(t)
  if (!g.length) { importError.value = 'Не нашли в таблице строку с группами. Это точно лист с расписанием?'; return }
  table.value = t
  groups.value = g
  period.value = findPeriod(t)
}

// ---------- проверка распознанного ----------

const review = ref(null)
const mode = ref('replace')
const reviewError = ref('')
const saved = ref('')

function recognize() {
  if (!period.value.start || !period.value.end || period.value.start > period.value.end) {
    importError.value = 'Укажи период модуля: с какого по какое число идут пары'
    return
  }
  const { patterns, skipped } = extract(table.value, group.value, period.value)
  review.value = { group: group.value.name, patterns, skipped }
  mode.value = 'replace'
  reviewError.value = ''
}

const reviewTotal = computed(() => review.value ? review.value.patterns.reduce((n, p) => n + p.dates.length, 0) : 0)

function dropPattern(p) { review.value.patterns = review.value.patterns.filter(x => x !== p) }
function dropDate(p, d) { p.dates = p.dates.filter(x => x !== d) }
const badPattern = p => !p.title.trim() || !(p.start < p.end)

function saveReview() {
  const ps = review.value.patterns
  if (ps.some(badPattern)) { reviewError.value = 'У подсвеченных строк нет названия или конец раньше начала. Поправь или убери их.'; return }
  const list = ps.flatMap(p => p.dates.map(date => ({
    date, start: p.start, end: p.end, title: p.title.trim(),
    kind: p.kind, teacher: p.teacher, room: p.room, building: p.building
  })))
  if (mode.value === 'replace' || !state.lessons.length) setLessons(list)
  else list.forEach(addLesson)
  saved.value = `Сохранили ${list.length} пар для группы ${review.value.group}.`
  setTimeout(() => { saved.value = '' }, 4000)
  review.value = null
  resetImport()
  sheets.value = []
  sheetGid.value = null
}
</script>

<template>
  <datalist id="ritm-kinds">
    <option value="лекция" />
    <option value="семинар" />
    <option value="практическое занятие" />
    <option value="лабораторная работа" />
  </datalist>

  <!-- экран проверки вместо обычного вида -->
  <BaseCard
    v-if="review"
    eyebrow="Проверка"
    title="Проверь распознанные пары"
    :sub="`Группа ${review.group}: ${reviewTotal} пар, ${review.patterns.length} разных занятий. Поправь, если что-то не так, и сохрани.`"
  >
    <div class="stack">
      <BaseNote v-if="review.skipped.length">
        Пропустили {{ review.skipped.length }} {{ review.skipped.length === 1 ? 'запись' : 'записи' }}, которые не похожи на пару
        (например, «{{ review.skipped[0].slice(0, 60) }}…»). Если нужно, добавь их вручную.
      </BaseNote>
      <BaseNote v-if="!review.patterns.length" type="warn">Для этой группы пар не нашли.</BaseNote>

      <div v-for="p in review.patterns" :key="p.id" class="pattern" :class="{ bad: badPattern(p) }">
        <div class="pattern-fields">
          <span class="pill">{{ DAYS[p.day] }}</span>
          <input v-model="p.start" type="time" aria-label="Начало">
          <input v-model="p.end" type="time" aria-label="Конец">
          <input v-model="p.title" class="wide" placeholder="Название" aria-label="Название">
          <input v-model="p.kind" list="ritm-kinds" placeholder="Вид" aria-label="Вид занятия">
          <input v-model="p.teacher" placeholder="Преподаватель" aria-label="Преподаватель">
          <input v-model="p.room" class="short" placeholder="Ауд." aria-label="Аудитория">
          <input v-model="p.building" class="short" placeholder="Корпус" aria-label="Корпус">
          <BaseButton variant="link" @click="dropPattern(p)">Убрать</BaseButton>
        </div>
        <div class="dates">
          <span v-if="!p.dates.length" class="muted">нет дат, не сохранится</span>
          <button
            v-for="d in p.dates"
            :key="d"
            type="button"
            class="date"
            :class="{ odd: weekday(d) !== p.day }"
            :title="weekday(d) !== p.day ? 'Дата не совпадает с днём недели, проверь' : 'Убрать эту дату'"
            @click="dropDate(p, d)"
          >{{ fmt(d) }} ×</button>
        </div>
      </div>

      <div v-if="state.lessons.length" class="field">
        <span>У тебя уже есть {{ state.lessons.length }} пар</span>
        <div class="chips">
          <BaseChip :active="mode === 'replace'" @click="mode = 'replace'">Заменить текущее</BaseChip>
          <BaseChip :active="mode === 'add'" @click="mode = 'add'">Добавить к текущему</BaseChip>
        </div>
      </div>

      <BaseNote v-if="reviewError" type="warn">{{ reviewError }}</BaseNote>
      <div class="row">
        <BaseButton :disabled="!reviewTotal" @click="saveReview">Сохранить {{ reviewTotal }} пар</BaseButton>
        <BaseButton variant="ghost" @click="review = null">Отмена</BaseButton>
      </div>
    </div>
  </BaseCard>

  <template v-else>
    <BaseNote v-if="saved">{{ saved }}</BaseNote>

    <div class="grid-main">
      <BaseCard eyebrow="Неделя" :title="weekLabel">
        <template #actions>
          <div class="row">
            <BaseButton variant="ghost" aria-label="Прошлая неделя" @click="weekStart = addDays(weekStart, -7)">‹</BaseButton>
            <BaseButton variant="link" @click="weekStart = addDays(todayStr(), -weekday(todayStr()))">Сегодня</BaseButton>
            <BaseButton variant="ghost" aria-label="Следующая неделя" @click="weekStart = addDays(weekStart, 7)">›</BaseButton>
          </div>
        </template>

        <p v-if="!state.lessons.length" class="muted">
          Пока пусто. Загрузи расписание из таблицы вуза или добавь пары вручную.
        </p>
        <p v-else-if="!week.length" class="muted">На этой неделе пар нет.</p>

        <div class="stack">
          <div v-for="d in week" :key="d.date" class="day">
            <div class="eyebrow" :class="{ today: d.date === todayStr() }">
              {{ DAYS[weekday(d.date)] }}, {{ fmt(d.date) }}{{ d.date === todayStr() ? ' · сегодня' : '' }}
            </div>

            <template v-for="l in d.lessons" :key="l.id">
              <div v-if="editId === l.id" class="lesson editing stack">
                <div class="edit-grid">
                  <label class="field"><span>Дата</span><input v-model="edit.date" type="date"></label>
                  <label class="field"><span>Начало</span><input v-model="edit.start" type="time"></label>
                  <label class="field"><span>Конец</span><input v-model="edit.end" type="time"></label>
                  <label class="field wide"><span>Название</span><input v-model="edit.title"></label>
                  <label class="field"><span>Вид</span><input v-model="edit.kind" list="ritm-kinds"></label>
                  <label class="field"><span>Преподаватель</span><input v-model="edit.teacher"></label>
                  <label class="field"><span>Аудитория</span><input v-model="edit.room"></label>
                  <label class="field"><span>Корпус</span><input v-model="edit.building"></label>
                </div>
                <BaseNote v-if="editError" type="warn">{{ editError }}</BaseNote>
                <div class="row">
                  <BaseButton @click="saveEdit">Сохранить</BaseButton>
                  <BaseButton variant="ghost" @click="editId = null">Отмена</BaseButton>
                </div>
              </div>

              <div v-else class="lesson">
                <div class="time">{{ l.start }}<span>{{ l.end }}</span></div>
                <div class="body">
                  <b>{{ l.title }}</b>
                  <div v-if="meta(l)" class="muted">{{ meta(l) }}</div>
                </div>
                <div class="actions">
                  <BaseButton variant="link" @click="startEdit(l)">Изменить</BaseButton>
                  <BaseButton variant="link" @click="remove(l)">Удалить</BaseButton>
                </div>
              </div>
            </template>
          </div>
        </div>
      </BaseCard>

      <div class="stack">
        <BaseCard eyebrow="Из таблицы вуза" title="Загрузить расписание" sub="Вставь ссылку на Google-таблицу, выбери курс и группу. Перед сохранением покажем, что распознали.">
          <div class="stack">
            <label class="field">
              <span>Ссылка на таблицу</span>
              <input v-model="link" placeholder="https://docs.google.com/spreadsheets/d/…">
            </label>
            <div class="row">
              <BaseButton :disabled="!!loading" @click="loadSheets">Найти курсы</BaseButton>
              <span v-if="loading" class="muted">{{ loading }}</span>
            </div>

            <div v-if="sheets.length" class="field">
              <span>Курс</span>
              <div class="chips">
                <BaseChip v-for="s in sheets" :key="s.gid" :active="sheetGid === s.gid" @click="pickSheet(s)">{{ s.name }}</BaseChip>
              </div>
            </div>

            <template v-if="groups.length">
              <div class="field">
                <span>Группа</span>
                <div class="chips">
                  <BaseChip v-for="g in groups" :key="g.col" :active="group === g" @click="group = g">{{ g.name }}</BaseChip>
                </div>
              </div>
              <div class="period">
                <label class="field"><span>Модуль с</span><input v-model="period.start" type="date"></label>
                <label class="field"><span>по</span><input v-model="period.end" type="date"></label>
              </div>
              <div>
                <BaseButton :disabled="!group" @click="recognize">Распознать пары</BaseButton>
              </div>
            </template>

            <BaseNote v-if="importError" type="warn">{{ importError }}</BaseNote>

            <label class="upload">
              <input type="file" accept=".csv,text/csv" @change="pickFile">
              <b>или загрузи CSV-файл</b>
              <span class="muted">Файл → Скачать → CSV на листе своего курса</span>
            </label>
          </div>
        </BaseCard>

        <BaseCard eyebrow="Вручную" title="Добавить пару">
          <div class="stack">
            <div class="edit-grid">
              <label class="field"><span>Дата</span><input v-model="form.date" type="date"></label>
              <label class="field"><span>Начало</span><input v-model="form.start" type="time"></label>
              <label class="field"><span>Конец</span><input v-model="form.end" type="time"></label>
              <label class="field wide"><span>Название</span><input v-model="form.title" placeholder="Например, Математический анализ"></label>
              <label class="field"><span>Вид</span><input v-model="form.kind" list="ritm-kinds"></label>
              <label class="field"><span>Преподаватель</span><input v-model="form.teacher"></label>
              <label class="field"><span>Аудитория</span><input v-model="form.room"></label>
              <label class="field"><span>Корпус</span><input v-model="form.building"></label>
              <label class="field wide"><span>Повторять каждую неделю до (необязательно)</span><input v-model="form.until" type="date"></label>
            </div>
            <BaseNote v-if="overlap" type="warn">
              Пересекается с «{{ overlap.title }}» {{ overlap.start }}–{{ overlap.end }}
            </BaseNote>
            <BaseNote v-if="formError" type="warn">{{ formError }}</BaseNote>
            <div>
              <BaseButton @click="addManual">Добавить</BaseButton>
            </div>
          </div>
        </BaseCard>
      </div>
    </div>
  </template>
</template>

<style scoped>
.day { display: grid; gap: 7px; }
.day .today { color: var(--c-primary); }

.lesson {
  display: grid;
  grid-template-columns: 52px 1fr auto;
  gap: 10px;
  align-items: center;
  background: var(--c-bg);
  border-radius: var(--radius-sm);
  padding: 9px 11px;
}
.lesson.editing { display: grid; grid-template-columns: 1fr; background: var(--c-hint); }
.time { font-size: 12px; font-weight: 700; }
.time span { display: block; font-weight: 400; color: var(--c-muted); }
.body b { font-size: 13px; }
.actions { display: flex; }

.edit-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); gap: 8px; }
.edit-grid > *, .period > * { min-width: 0; }
.edit-grid input, .period input { width: 100%; min-width: 0; }
.edit-grid .wide { grid-column: 1 / -1; }

.period { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

.upload {
  display: grid;
  gap: 4px;
  text-align: center;
  padding: 14px;
  border: 1px dashed #BAC9BF;
  background: var(--c-bg);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.upload input { display: none; }

.pattern {
  border: 1px solid var(--c-border);
  border-radius: var(--radius-sm);
  padding: 10px;
  display: grid;
  gap: 8px;
}
.pattern.bad { border-color: var(--c-accent); background: var(--c-accent-soft); }
.pattern-fields {
  display: grid;
  grid-template-columns: auto 92px 92px minmax(160px, 2fr) minmax(110px, 1fr) minmax(120px, 1fr) 70px 70px auto;
  gap: 6px;
  align-items: center;
}
.pattern-fields input { padding: 7px 8px; min-width: 0; }
.pattern-fields .pill { justify-self: start; }
.dates { display: flex; flex-wrap: wrap; gap: 5px; }
.date {
  border: 1px solid var(--c-border);
  background: var(--c-card);
  border-radius: 99px;
  padding: 3px 9px;
  font-size: 12px;
  color: var(--c-muted);
}
.date:hover { border-color: var(--c-accent); color: var(--c-accent-deep); }
.date.odd { background: var(--c-accent-soft); color: var(--c-accent-deep); border-color: var(--c-accent); }

@media (max-width: 1100px) {
  .pattern-fields { grid-template-columns: auto 1fr 1fr; }
  .pattern-fields .wide { grid-column: 1 / -1; }
}
@media (max-width: 720px) {
  .lesson { grid-template-columns: 46px 1fr; }
  .actions { grid-column: 2; }
}
</style>
