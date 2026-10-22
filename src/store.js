import { reactive, watch } from 'vue'

const KEY = 'ritm_v1'

function empty() {
  return {
    // пары на конкретные даты: { id, date: 'YYYY-MM-DD', start: '08:00', end: '09:20', title,
    //   kind: 'лекция' | 'семинар' | 'практическое занятие' | '', teacher, room, building }
    // room и building строки как в расписании вуза ('302', 'БП', 'online'), могут быть пустыми
    lessons: [],
    // дела: { id, title, minutes, importance: 1-3, flexible: true/false,
    //         deadline: 'YYYY-MM-DD' или null, firstStep: '', done: false, regular: false }
    tasks: [],
    // чек-ины: { date: 'YYYY-MM-DD', mood: 1-5, sleep: часы, load: 'light' | 'normal' | 'heavy' }
    checkins: [],
    // эксперименты: { id, question, change, startDate, endDate, notes: '',
    //   marks: [{ date, energy: 1-5, helped: 'yes' | 'no' | 'unsure' }],
    //   status: 'active' | 'finished', conclusion: 'keep' | 'change' | 'other' | null }
    experiments: [],
    // свои идеи для экспериментов: { id, title, change }
    ideas: []
  }
}

// если в сохранённом что-то побилось, берём только нормальные куски
function load() {
  const base = empty()
  try {
    const saved = JSON.parse(localStorage.getItem(KEY))
    if (saved && typeof saved === 'object') {
      for (const k of ['lessons', 'tasks', 'checkins', 'experiments', 'ideas']) {
        if (Array.isArray(saved[k])) base[k] = saved[k]
      }
    }
  } catch (e) {}
  moveOldExperimentData(base)
  return base
}

// раньше заметки и идеи эксперимента лежали в отдельных ключах, забираем их к себе один раз
function moveOldExperimentData(base) {
  try {
    const notes = JSON.parse(localStorage.getItem('ritm_experiment_notes_v1'))
    const ideas = JSON.parse(localStorage.getItem('ritm_experiment_ideas_v1'))
    if (!notes && !ideas) return
    if (notes && typeof notes === 'object') {
      for (const e of base.experiments) {
        if (!e.notes && notes[e.id]) e.notes = String(notes[e.id])
      }
    }
    if (Array.isArray(ideas)) {
      for (const i of ideas) {
        if (i && i.title && i.change && !base.ideas.some(x => x.change === i.change)) {
          base.ideas.push({ id: i.id || uid(), title: i.title, change: i.change })
        }
      }
    }
    localStorage.setItem(KEY, JSON.stringify(base))
    localStorage.removeItem('ritm_experiment_notes_v1')
    localStorage.removeItem('ritm_experiment_ideas_v1')
  } catch (e) {}
}

export const state = reactive(load())

watch(state, () => {
  try { localStorage.setItem(KEY, JSON.stringify(state)) } catch (e) {}
}, { deep: true })

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function dateStr(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function todayStr() {
  return dateStr(new Date())
}

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(s, n) {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  return dateStr(d)
}

// 0 = пн, как у пар
export function weekday(s) {
  return (parseDate(s).getDay() + 6) % 7
}

export function addLesson(l) { state.lessons.push({ id: uid(), ...l }) }
export function updateLesson(id, patch) {
  const l = state.lessons.find(x => x.id === id)
  if (l) Object.assign(l, patch)
}
export function setLessons(list) { state.lessons = list.map(l => ({ ...l, id: l.id || uid() })) }
export function removeLesson(id) { state.lessons = state.lessons.filter(l => l.id !== id) }
export function lessonsOn(date) {
  return state.lessons.filter(l => l.date === date).sort((a, b) => a.start.localeCompare(b.start))
}

export function addTask(t) {
  const task = {
    id: uid(), title: '', minutes: 30, importance: 2, flexible: true,
    deadline: null, firstStep: '', done: false, regular: false, ...t
  }
  state.tasks.push(task)
  return task.id
}
export function updateTask(id, patch) {
  const t = state.tasks.find(x => x.id === id)
  if (t) Object.assign(t, patch)
}
export function removeTask(id) { state.tasks = state.tasks.filter(t => t.id !== id) }

export function saveCheckin(c) {
  const i = state.checkins.findIndex(x => x.date === c.date)
  if (i >= 0) state.checkins[i] = c
  else state.checkins.push(c)
}
export function getCheckin(date) { return state.checkins.find(c => c.date === date) || null }

export function addExperiment(e) {
  const exp = { id: uid(), notes: '', marks: [], status: 'active', conclusion: null, ...e }
  state.experiments.push(exp)
  return exp.id
}
export function addMark(expId, mark) {
  const e = state.experiments.find(x => x.id === expId)
  if (!e) return
  const i = e.marks.findIndex(m => m.date === mark.date)
  if (i >= 0) e.marks[i] = mark
  else e.marks.push(mark)
}
export function finishExperiment(id, conclusion) {
  const e = state.experiments.find(x => x.id === id)
  if (e) { e.status = 'finished'; e.conclusion = conclusion }
}
export function updateExperiment(id, patch) {
  const e = state.experiments.find(x => x.id === id)
  if (e) Object.assign(e, patch)
}
export function removeExperiment(id) { state.experiments = state.experiments.filter(e => e.id !== id) }

export function addIdea(idea) {
  const item = { id: uid(), title: '', change: '', ...idea }
  state.ideas.push(item)
  return item.id
}
export function removeIdea(id) { state.ideas = state.ideas.filter(i => i.id !== id) }

export function exportData() { return JSON.stringify(state, null, 2) }
export function clearAll() { Object.assign(state, empty()) }

// демо для проверки и защиты. рандом с фиксированным зерном, чтобы у всех получалось одинаково
export function fillDemo() {
  let seed = 7
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646 }
  const today = todayStr()
  const day = n => addDays(today, n)

  // недельный шаблон раскладываем по датам: часть пар через неделю, одна пара отменена, как в настоящем расписании
  const template = [
    [0, '08:00', '09:20', 'Дискретная математика', 'лекция', 'Орлов Д.С.', '402', 'БП'],
    [0, '09:30', '10:50', 'Линейная алгебра и геометрия', 'семинар', 'Миронова В.Г.', '302', 'БП'],
    [0, '11:10', '12:30', 'Программирование на C/C++', 'практическое занятие', 'Шилов А.Ю.', '315', 'БП', 'odd'],
    [1, '09:30', '10:50', 'Математический анализ', 'лекция', 'Чистяков И.Н.', '201', 'К'],
    [1, '11:10', '12:30', 'Английский язык', 'практическое занятие', 'Смирнова Е.П.', '405', 'БП'],
    [1, '18:10', '19:30', 'Основы российской государственности', 'лекция', 'Кочетов С.Н.', '', 'online', 'even'],
    [2, '08:00', '09:20', 'Линейная алгебра и геометрия', 'лекция', 'Хомяков Д.В.', '302', 'БП'],
    [2, '09:30', '10:50', 'Дискретная математика', 'семинар', 'Садовская А.В.', '405', 'БП'],
    [2, '13:00', '14:20', 'Технологии программирования', 'семинар', 'Устинов И.Б.', '314', 'БП'],
    [3, '11:10', '12:30', 'Физическая культура', '', '', '', 'Р'],
    [3, '13:00', '14:20', 'Цифровая грамотность', 'семинар', 'Устинов И.Б.', '314', 'БП', 'even'],
    [4, '09:30', '10:50', 'Математический анализ', 'семинар', 'Чистяков И.Н.', '210', 'К'],
    [4, '11:10', '12:30', 'Программирование на C/C++', 'лекция', 'Шилов А.Ю.', '406', 'БП'],
    [5, '09:30', '10:50', 'Английский язык', 'практическое занятие', 'Смирнова Е.П.', '405', 'БП', 'odd']
  ]
  const lessons = []
  for (let i = -21; i <= 21; i++) {
    const date = day(i)
    const week = Math.floor((i + 21) / 7)
    for (const [wd, start, end, title, kind, teacher, room, building, weeks] of template) {
      if (weekday(date) !== wd) continue
      if (weeks === 'odd' && week % 2 === 0) continue
      if (weeks === 'even' && week % 2 === 1) continue
      if (i === 2 && start === '13:00') continue
      lessons.push({ id: uid(), date, start, end, title, kind, teacher, room, building })
    }
  }

  const task = t => ({
    id: uid(), minutes: 30, importance: 2, flexible: true,
    deadline: null, firstStep: '', done: false, regular: false, ...t
  })
  const tasks = [
    task({ title: 'Доклад по истории', minutes: 90, importance: 3, deadline: day(2), firstStep: 'Открыть документ и набросать три тезиса' }),
    task({ title: 'Лабораторная по программированию', minutes: 120, deadline: day(5) }),
    task({ title: 'Прочитать главу по матанализу', minutes: 60, deadline: day(3), firstStep: 'Найти главу и прочитать первую страницу' }),
    task({ title: 'Подготовиться к контрольной по английскому', minutes: 60, importance: 3, deadline: day(1), firstStep: 'Выписать 10 слов из прошлого урока' }),
    task({ title: 'Смена в кофейне', minutes: 240, flexible: false, regular: true }),
    task({ title: 'Тренировка', minutes: 60, regular: true }),
    task({ title: 'Купить продукты', minutes: 30, importance: 1 }),
    task({ title: 'Сдать справку в деканат', minutes: 15, importance: 1, done: true })
  ]

  // примерно семестр отметок, сегодня пустое, чтобы показать чек-ин вживую.
  // последний месяц тяжелее (сессия близко), а при недосыпе настроение ниже
  const checkins = []
  for (let i = 120; i >= 1; i--) {
    const date = day(-i)
    const wd = weekday(date)
    const session = i <= 28 && wd >= 1 && wd <= 3
    if (!session && rnd() < 0.12) continue
    let load = rnd() < 0.25 ? 'light' : rnd() < 0.75 ? 'normal' : 'heavy'
    if (session) load = 'heavy'
    if (wd === 6 && load === 'heavy') load = 'light'
    const heavy = load === 'heavy' ? 1 : 0
    const sleep = clamp(Math.round((7.2 + (rnd() - 0.5) * 3.5 - heavy * 0.8) * 2) / 2, 4, 10)
    const mood = clamp(Math.round(2.4 + (sleep - 5) * 0.6 + (rnd() - 0.5) * 1.6 - heavy * 0.5), 1, 5)
    checkins.push({ date, mood, sleep, load })
  }

  const start = day(-30)
  const experiments = [{
    id: uid(),
    question: 'Мне легче, если лечь до 00:00',
    change: 'Ложиться до полуночи, телефон убирать в 23:30',
    startDate: start,
    endDate: addDays(start, 6),
    marks: [
      [0, 3, 'unsure'], [1, 4, 'yes'], [2, 2, 'no'], [4, 4, 'yes'], [5, 4, 'yes'], [6, 5, 'yes']
    ].map(([n, energy, helped]) => ({ date: addDays(start, n), energy, helped })),
    notes: 'Первые два дня тяжело, потом привык. Утром правда бодрее',
    status: 'finished',
    conclusion: 'keep'
  }]

  Object.assign(state, { lessons, tasks, checkins, experiments, ideas: [] })
}

function clamp(x, min, max) { return Math.min(max, Math.max(min, x)) }
