// план дня: пары стоят на месте, дела раскладываем по свободным окнам между ними

const DAY_START = 8 * 60
const DAY_END = 22 * 60

export function toMin(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

export function toTime(min) {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

// плохо спал или тяжёлый день: дел меньше, паузы длиннее
export function isLightDay(checkin) {
  return !!checkin && (checkin.sleep < 6 || checkin.load === 'heavy')
}

// сначала то, что нельзя перенести, потом срочное, потом по ближайшему дедлайну
function byPriority(a, b) {
  if (a.flexible !== b.flexible) return a.flexible ? 1 : -1
  if (a.importance !== b.importance) return b.importance - a.importance
  if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline)
  if (a.deadline || b.deadline) return a.deadline ? -1 : 1
  return 0
}

// from: с какой минуты планировать (для сегодняшнего дня это «сейчас»)
export function buildPlan({ lessons, tasks, checkin, from = DAY_START }) {
  const light = isLightDay(checkin)
  const gap = light ? 20 : 10
  // гибких дел не больше стольких штук и минут, обязательные ставим всегда
  const maxFlexible = light ? 2 : 4
  const maxMinutes = light ? 120 : 240
  const start = Math.max(DAY_START, from)

  const blocks = lessons.map(l => ({ type: 'lesson', start: toMin(l.start), end: toMin(l.end), lesson: l }))

  const windows = []
  let cursor = start
  for (const b of blocks) {
    if (b.start > cursor) windows.push({ start: cursor, end: b.start })
    cursor = Math.max(cursor, b.end)
  }
  if (cursor < DAY_END) windows.push({ start: cursor, end: DAY_END })

  if (light) {
    const w = windows.find(w => w.start >= 12 * 60 && w.end - w.start >= 60) || windows.find(w => w.end - w.start >= 30)
    if (w) {
      blocks.push({ type: 'pause', start: w.start, end: w.start + 30 })
      w.start += 30 + gap
    }
  }

  const left = []
  let flexibleCount = 0, flexibleMinutes = 0, full = false
  for (const task of [...tasks].sort(byPriority)) {
    const minutes = Number(task.minutes) || 30
    // упёрлись в лимит: всё менее важное тоже ждёт, чтобы не обгоняло срочное
    if (task.flexible && (full || flexibleCount >= maxFlexible || flexibleMinutes + minutes > maxMinutes)) {
      full = true
      left.push(task)
      continue
    }
    const w = windows.find(w => w.end - w.start >= minutes)
    if (!w) { left.push(task); continue }
    blocks.push({ type: 'task', start: w.start, end: w.start + minutes, task })
    w.start += minutes + gap
    if (task.flexible) { flexibleCount++; flexibleMinutes += minutes }
  }
  blocks.sort((a, b) => a.start - b.start)

  // пустые места от получаса показываем как свободное время
  const items = []
  let prev = start
  for (const b of blocks) {
    if (b.start - prev >= 30) items.push({ type: 'free', start: prev, end: b.start })
    items.push(b)
    prev = Math.max(prev, b.end)
  }
  if (blocks.length && DAY_END - prev >= 30) items.push({ type: 'free', start: prev, end: DAY_END })

  return { items, left, light }
}
