<script setup>
import { ref, computed, onBeforeUnmount } from 'vue'
import { state, todayStr, addDays, parseDate, weekday, exportData, clearAll } from '../store.js'
import BaseCard from '../components/BaseCard.vue'
import BaseButton from '../components/BaseButton.vue'
import BaseChip from '../components/BaseChip.vue'
import BaseNote from '../components/BaseNote.vue'

const today = todayStr()

const PERIODS = [
  { key: 'week', label: 'Неделя', dat: 'к прошлой неделе', than: 'на прошлой неделе' },
  { key: 'month', label: 'Месяц', dat: 'к прошлому месяцу', than: 'в прошлом месяце' },
  { key: 'semester', label: 'Семестр', dat: 'к предыдущему периоду', than: 'в предыдущем периоде' }
]
const WD = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']

const period = ref('week')
const tip = ref(null)
const message = ref('')
let messageTimer = null

const words = computed(() => PERIODS.find(p => p.key === period.value))

function setPeriod(key) {
  period.value = key
  tip.value = null
}

// форматирование

const fmt = n => n.toLocaleString('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const fmtLoose = n => n.toLocaleString('ru-RU', { maximumFractionDigits: 1 })
const longDate = s => parseDate(s).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
const shortDM = s => s.slice(8) + '.' + s.slice(5, 7)

function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000)
}

function avg(arr) {
  return arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null
}

// периоды

const range = computed(() => {
  let start
  if (period.value === 'week') start = addDays(today, -6)
  else if (period.value === 'month') start = addDays(today, -29)
  else {
    const d = parseDate(today)
    const m = d.getMonth()
    const y = d.getFullYear()
    start = m >= 8 ? `${y}-09-01` : m === 0 ? `${y - 1}-09-01` : `${y}-02-01`
  }
  const days = daysBetween(start, today) + 1
  return { start, end: today, days, prevStart: addDays(start, -days), prevEnd: addDays(start, -1) }
})

function entriesIn(from, to) {
  return state.checkins.filter(c => c.date >= from && c.date <= to)
}

function summarize(list) {
  const sleeps = list.map(c => c.sleep).filter(Number.isFinite)
  return {
    list,
    n: list.length,
    mood: avg(list.map(c => c.mood)),
    sleep: avg(sleeps),
    good: list.filter(c => c.mood >= 4).length,
    heavy: list.filter(c => c.load === 'heavy').length
  }
}

const cur = computed(() => summarize(entriesIn(range.value.start, range.value.end)))
const prev = computed(() => summarize(entriesIn(range.value.prevStart, range.value.prevEnd)))
const hasData = computed(() => cur.value.n > 0)

const rangeText = computed(() => `${longDate(range.value.start)} — ${longDate(range.value.end)} · отметок: ${cur.value.n}`)

// показатели

const NO_BASE = { arrow: '', text: 'не с чем сравнить' }

function diffAvg(a, b, unit) {
  if (a == null || b == null) return NO_BASE
  const d = Math.round((a - b) * 10) / 10
  if (d === 0) return { arrow: '→', text: `без изменений ${words.value.dat}` }
  return { arrow: d > 0 ? '↑' : '↓', text: `${d > 0 ? '+' : ''}${fmt(d)}${unit} ${words.value.dat}` }
}

function diffCount(a, b) {
  if (!prev.value.n) return NO_BASE
  const d = a - b
  if (d === 0) return { arrow: '→', text: `столько же, сколько ${words.value.than}` }
  return {
    arrow: d > 0 ? '↑' : '↓',
    text: `на ${Math.abs(d)} ${d > 0 ? 'больше' : 'меньше'}, чем ${words.value.than}`
  }
}

const cards = computed(() => {
  const c = cur.value
  const p = prev.value
  return [
    {
      key: 'mood',
      label: 'Настроение',
      value: c.mood == null ? '—' : `${fmt(c.mood)} из 5`,
      cmp: diffAvg(c.mood, p.mood, '')
    },
    {
      key: 'sleep',
      label: 'Сон',
      value: c.sleep == null ? '—' : `${fmt(c.sleep)} ч`,
      cmp: diffAvg(c.sleep, p.sleep, ' ч')
    },
    { key: 'good', label: 'Хорошие дни', value: `${c.good} из ${c.n}`, cmp: diffCount(c.good, p.good) },
    { key: 'heavy', label: 'Тяжёлые дни', value: `${c.heavy} из ${c.n}`, cmp: diffCount(c.heavy, p.heavy) }
  ]
})

// графики по дням

const charts = [
  { key: 'mood', title: 'Настроение' },
  { key: 'sleep', title: 'Сон' }
]

const points = computed(() => {
  const { start, end } = range.value
  const list = []
  if (period.value !== 'semester') {
    const byDate = new Map(state.checkins.map(c => [c.date, c]))
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const c = byDate.get(d)
      list.push({
        key: d,
        mood: c ? c.mood : null,
        sleep: c && Number.isFinite(c.sleep) ? c.sleep : null,
        n: c ? 1 : 0,
        label: period.value === 'week' ? `${WD[weekday(d)]}\n${Number(d.slice(8))}` : shortDM(d),
        title: `${WD[weekday(d)]}, ${longDate(d)}`
      })
    }
    return list
  }
  // в семестре столбик = неделя с понедельника
  for (let ws = addDays(start, -weekday(start)); ws <= end; ws = addDays(ws, 7)) {
    const from = ws < start ? start : ws
    const we = addDays(ws, 6)
    const to = we > end ? end : we
    const week = entriesIn(from, to)
    list.push({
      key: ws,
      mood: avg(week.map(c => c.mood)),
      sleep: avg(week.map(c => c.sleep).filter(Number.isFinite)),
      n: week.length,
      label: shortDM(ws),
      title: `Неделя с ${longDate(from)}`
    })
  }
  return list
})

const labelStep = computed(() => (points.value.length <= 7 ? 1 : Math.ceil(points.value.length / 7)))
const showLabel = i => (points.value.length - 1 - i) % labelStep.value === 0

function barHeight(key, p) {
  const share = key === 'mood' ? p.mood / 5 : Math.min(p.sleep, 12) / 12
  return `${Math.max(0, Math.min(1, share)) * 100}%`
}

function barClass(key, p) {
  if (key === 'sleep') return 'calm'
  return p.mood >= 4 ? 'good' : 'low'
}

function tipText(key, p) {
  if (p[key] == null) return `${p.title}: ${period.value === 'semester' ? 'нет отметок' : 'нет отметки'}`
  const name = key === 'mood' ? 'настроение' : 'сон'
  if (period.value === 'semester') {
    const v = key === 'mood' ? `${fmt(p.mood)} из 5` : `${fmt(p.sleep)} ч`
    return `${p.title}: ${name} ${v}, отметок: ${p.n}`
  }
  const v = key === 'mood' ? `${fmtLoose(p.mood)} из 5` : `${fmtLoose(p.sleep)} ч`
  return `${p.title}: ${name} ${v}`
}

function tipSide(i) {
  const n = points.value.length
  if (i < n / 3) return 'left'
  if (i > (n * 2) / 3) return 'right'
  return 'mid'
}

const isTip = (key, i) => tip.value && tip.value.chart === key && tip.value.i === i

// сон и настроение

const groups = computed(() => {
  const defs = [
    { key: 'low', label: 'меньше 6 ч', test: s => s < 6 },
    { key: 'mid', label: 'от 6 до 7 ч', test: s => s >= 6 && s < 7 },
    { key: 'high', label: '7 ч и больше', test: s => s >= 7 }
  ]
  const list = cur.value.list.filter(c => Number.isFinite(c.sleep))
  return defs.map(d => {
    const g = list.filter(c => d.test(c.sleep))
    return { key: d.key, label: d.label, n: g.length, mood: avg(g.map(c => c.mood)) }
  })
})

const observation = computed(() => {
  const [lo, , hi] = groups.value
  if (lo.n >= 3 && hi.n >= 3) {
    return `После сна 7+ часов настроение у тебя в среднем ${fmt(hi.mood)}, после сна меньше 6 часов ${fmt(lo.mood)}`
  }
  return 'Пока мало данных, чтобы сравнить'
})

// нагрузка

const load = computed(() => {
  const defs = [
    { key: 'light', label: 'Лёгкие' },
    { key: 'normal', label: 'Обычные' },
    { key: 'heavy', label: 'Тяжёлые' }
  ]
  const counts = defs.map(d => cur.value.list.filter(c => c.load === d.key).length)
  const total = counts.reduce((s, x) => s + x, 0)
  return defs.map((d, i) => ({
    ...d,
    count: counts[i],
    pct: total ? Math.round((counts[i] / total) * 100) : 0
  }))
})

// мои данные

function download() {
  const blob = new Blob([exportData()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'ritm-data.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function wipe() {
  if (!confirm('Удалить все пары, дела, отметки и эксперименты? Отменить будет нельзя')) return
  clearAll()
  tip.value = null
  message.value = 'Данные удалены'
  clearTimeout(messageTimer)
  messageTimer = setTimeout(() => { message.value = '' }, 5000)
}

onBeforeUnmount(() => clearTimeout(messageTimer))
</script>

<template>
  <div class="stack">
    <div class="row">
      <div class="chips">
        <BaseChip v-for="p in PERIODS" :key="p.key" :active="period === p.key" @click="setPeriod(p.key)">
          {{ p.label }}
        </BaseChip>
      </div>
      <span class="muted">{{ rangeText }}</span>
    </div>

    <template v-if="hasData">
      <div class="stats">
        <div v-for="c in cards" :key="c.key" class="stat">
          <div class="eyebrow">{{ c.label }}</div>
          <div class="stat-value">{{ c.value }}</div>
          <p class="muted">
            <span v-if="c.cmp.arrow" class="arrow">{{ c.cmp.arrow }}</span>
            {{ c.cmp.text }}
          </p>
        </div>
      </div>

      <BaseCard
        eyebrow="Динамика"
        title="Настроение и сон по дням"
        :sub="period === 'semester' ? 'Один столбик — одна неделя, среднее по отметкам' : 'Один столбик — один день. Наведи или нажми, чтобы увидеть значение'"
      >
        <div class="charts">
          <div v-for="c in charts" :key="c.key" class="chart">
            <div class="chart-head">
              <h3>{{ c.title }}</h3>
              <span v-if="c.key === 'mood'" class="muted legend-inline">
                <span class="dot good"></span>4–5
                <span class="dot low"></span>1–3
              </span>
              <span v-else class="muted">часы, до 12</span>
            </div>
            <div class="plot" @mouseleave="tip = null">
              <div
                class="cols"
                :class="{ dense: points.length > 7 }"
                :style="{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }"
              >
                <button
                  v-for="(p, i) in points"
                  :key="p.key"
                  type="button"
                  class="col"
                  :aria-label="tipText(c.key, p)"
                  @mouseenter="tip = { chart: c.key, i }"
                  @focus="tip = { chart: c.key, i }"
                  @blur="tip = null"
                  @click="tip = { chart: c.key, i }"
                >
                  <span
                    v-if="p[c.key] != null"
                    class="bar"
                    :class="barClass(c.key, p)"
                    :style="{ height: barHeight(c.key, p) }"
                  ></span>
                  <span v-if="isTip(c.key, i)" class="tip" :class="tipSide(i)">{{ tipText(c.key, p) }}</span>
                </button>
              </div>
            </div>
            <div
              class="axis"
              :class="{ dense: points.length > 7 }"
              :style="{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }"
            >
              <div v-for="(p, i) in points" :key="p.key" class="tick">
                <span v-if="showLabel(i)">{{ p.label }}</span>
              </div>
            </div>
          </div>
        </div>
      </BaseCard>

      <div class="grid-2">
        <BaseCard eyebrow="Связь" title="Сон и настроение" sub="Среднее настроение в зависимости от сна">
          <div class="stack">
            <div v-for="g in groups" :key="g.key" class="gline">
              <span class="glabel">{{ g.label }}</span>
              <div class="track">
                <div v-if="g.mood != null" class="fill" :style="{ width: `${(g.mood / 5) * 100}%` }"></div>
              </div>
              <div class="gnum">
                <b>{{ g.mood == null ? '—' : fmt(g.mood) }}</b>
                <span class="muted">{{ g.n }} дн.</span>
              </div>
            </div>
            <p class="observation">{{ observation }}</p>
            <p class="muted">Это наблюдение о своём опыте, а не медицинский вывод</p>
          </div>
        </BaseCard>

        <BaseCard eyebrow="Распределение" title="Нагрузка" sub="Какими были дни за выбранный период">
          <div class="stack">
            <div class="loadbar" role="img" aria-label="Распределение лёгких, обычных и тяжёлых дней">
              <div
                v-for="l in load"
                v-show="l.count > 0"
                :key="l.key"
                class="seg"
                :class="l.key"
                :style="{ flexGrow: l.count }"
              ></div>
            </div>
            <div class="legend">
              <div v-for="l in load" :key="l.key" class="lrow">
                <span class="sw" :class="l.key"></span>
                <span>{{ l.label }}</span>
                <span class="muted">{{ l.count }} дн. · {{ l.pct }}%</span>
              </div>
            </div>
          </div>
        </BaseCard>
      </div>
    </template>

    <BaseCard v-else eyebrow="Статистика" title="Пока пусто">
      <p class="muted">За этот период пока нет отметок. Сделай чек-ин или нажми „Заполнить демо“ в шапке</p>
    </BaseCard>

    <BaseNote type="info">
      Если стало тяжело, можно обратиться в студенческую службу поддержки:
      <a href="tel:88002500433">8 800 250-04-33</a>,
      <a href="https://help.hse.ru" target="_blank" rel="noopener">https://help.hse.ru</a>.
      Это бесплатно и конфиденциально. Решение всегда за тобой
    </BaseNote>

    <BaseCard eyebrow="Приватность" title="Мои данные">
      <div class="stack">
        <p class="muted">Все данные хранятся только в этом браузере. Их никто, кроме тебя, не видит</p>
        <div class="row">
          <BaseButton variant="ghost" @click="download">Скачать мои данные</BaseButton>
          <BaseButton variant="link" @click="wipe">Удалить все данные</BaseButton>
        </div>
        <p v-if="message" class="muted" role="status">{{ message }}</p>
      </div>
    </BaseCard>
  </div>
</template>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 15px;
}
.stat {
  background: var(--c-card);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  padding: 16px 17px;
  box-shadow: var(--shadow);
}
.stat-value {
  font: 800 26px/1.2 var(--font-head);
  letter-spacing: -0.5px;
  margin: 6px 0 4px;
}
.arrow { font-weight: 700; }

.charts { display: grid; gap: 20px; }
.chart-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 28px;
}
.legend-inline { display: inline-flex; align-items: center; gap: 6px; }
.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.dot.low { margin-left: 6px; }
.dot.good { background: var(--c-primary); }
.dot.low { background: var(--c-accent); }

.plot { border-bottom: 1px solid var(--c-border); }
.cols {
  display: grid;
  gap: 8px;
  height: 110px;
}
.cols.dense { gap: 2px; }
.col {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  border-radius: 6px;
}
.col:hover, .col:focus-visible { background: var(--c-hint); }
.bar {
  width: 72%;
  max-width: 22px;
  min-height: 3px;
  border-radius: 5px 5px 2px 2px;
}
.bar.good { background: var(--c-primary); }
.bar.low { background: var(--c-accent); }
.bar.calm { background: var(--c-faint); }

.tip {
  position: absolute;
  bottom: 100%;
  margin-bottom: 4px;
  z-index: 3;
  padding: 4px 8px;
  border-radius: 8px;
  background: var(--c-text);
  color: var(--c-card);
  font-size: 11px;
  line-height: 1.4;
  white-space: nowrap;
  pointer-events: none;
}
.tip.left { left: 0; }
.tip.right { right: 0; }
.tip.mid { left: 50%; transform: translateX(-50%); }

.axis {
  display: grid;
  gap: 8px;
}
.axis.dense { gap: 2px; }
.tick {
  position: relative;
  height: 30px;
}
.tick span {
  position: absolute;
  top: 5px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  line-height: 1.3;
  text-align: center;
  white-space: pre-line;
  color: var(--c-muted);
}

.gline {
  display: grid;
  grid-template-columns: 92px minmax(0, 1fr) 50px;
  align-items: center;
  gap: 10px;
}
.glabel { font-size: 13px; }
.track {
  height: 14px;
  border-radius: 99px;
  background: var(--c-hint);
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 99px;
  background: var(--c-primary);
}
.gnum {
  display: grid;
  text-align: right;
  line-height: 1.3;
}
.observation { font-size: 13px; }

.loadbar {
  display: flex;
  height: 24px;
  border-radius: 99px;
  overflow: hidden;
  border: 1px solid var(--c-border);
}
.seg { flex-basis: 0; }
.seg.light, .sw.light { background: var(--c-primary-soft); }
.seg.normal, .sw.normal { background: var(--c-primary); }
.seg.heavy, .sw.heavy { background: var(--c-accent); }
.legend { display: grid; gap: 8px; }
.lrow {
  display: grid;
  grid-template-columns: 14px 1fr auto;
  align-items: center;
  gap: 10px;
  font-size: 13px;
}
.sw {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  box-shadow: inset 0 0 0 1px var(--c-border);
}

a {
  color: var(--c-primary);
  font-weight: 650;
}

@media (max-width: 720px) {
  .stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .stat { padding: 14px; }
  .stat-value { font-size: 22px; }
}
</style>