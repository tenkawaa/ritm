<script setup>
import { ref, computed, onUnmounted } from 'vue'
import {
  state, todayStr, parseDate, addDays, lessonsOn, getCheckin, updateTask,
  skippedToday, skipForToday, unskipForToday
} from '../store.js'
import { buildPlan, toTime } from '../planner.js'
import BaseCard from '../components/BaseCard.vue'
import BaseButton from '../components/BaseButton.vue'
import BaseNote from '../components/BaseNote.vue'

const nowMinutes = () => {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

// план считаем от момента, когда открыли вкладку, чтобы дела не прыгали каждую минуту
const from = Math.ceil(nowMinutes() / 5) * 5
const today = ref(todayStr())
const now = ref(nowMinutes())
const timer = setInterval(() => {
  today.value = todayStr()
  now.value = nowMinutes()
}, 60000)
onUnmounted(() => clearInterval(timer))

const checkin = computed(() => getCheckin(today.value))
const lessons = computed(() => lessonsOn(today.value))
const skipped = computed(() => skippedToday())
const openTasks = computed(() => state.tasks.filter(t => !t.done && !skipped.value.includes(t.id)))
const plan = computed(() => buildPlan({ lessons: lessons.value, tasks: openTasks.value, checkin: checkin.value, from }))

const taskCount = computed(() => plan.value.items.filter(i => i.type === 'task').length)
const dayOver = computed(() => from >= 22 * 60)
const skippedTasks = computed(() => state.tasks.filter(t => !t.done && skipped.value.includes(t.id)))

const lightReason = computed(() => {
  const c = checkin.value
  if (!c) return ''
  const sleep = String(c.sleep).replace('.', ',')
  if (c.sleep < 6 && c.load === 'heavy') return `Сон ${sleep} ч и тяжёлый день.`
  if (c.sleep < 6) return `Сон ${sleep} ч.`
  return 'Сегодня тяжёлый день.'
})

const LOADS = { light: 'лёгкая', normal: 'обычная', heavy: 'тяжёлая' }

const started = ref([])
function start(id) { started.value = [...started.value, id] }

function duration(min) {
  const h = Math.floor(min / 60), m = min % 60
  if (!h) return `${m} мин`
  return m ? `${h} ч ${m} мин` : `${h} ч`
}

function lessonMeta(l) {
  const place = l.room ? `ауд. ${[l.room, l.building].filter(Boolean).join(' ')}`
    : l.building && l.building !== 'online' ? `корпус ${l.building}` : l.building
  return [l.kind, place, l.teacher].filter(Boolean).join(' · ')
}

// 1 пара, 2 пары, 5 пар
function plural(n, forms) {
  const a = n % 10, b = n % 100
  const form = a === 1 && b !== 11 ? forms[0] : a >= 2 && a <= 4 && (b < 12 || b > 14) ? forms[1] : forms[2]
  return `${n} ${form}`
}

function taskMeta(t) {
  const parts = []
  if (t.importance === 3) parts.push('срочное')
  if (!t.flexible) parts.push('обязательно сегодня')
  if (t.deadline) {
    const tomorrow = addDays(today.value, 1)
    parts.push(t.deadline < today.value ? 'срок прошёл'
      : t.deadline === today.value ? 'срок сегодня'
      : t.deadline === tomorrow ? 'срок завтра'
      : 'до ' + parseDate(t.deadline).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', ''))
  }
  return parts.join(' · ')
}

const experiment = computed(() => state.experiments.find(e => e.status === 'active') || null)
const experimentDay = computed(() => {
  const e = experiment.value
  if (!e) return null
  const total = Math.round((parseDate(e.endDate) - parseDate(e.startDate)) / 86400000) + 1
  const day = Math.round((parseDate(today.value) - parseDate(e.startDate)) / 86400000) + 1
  return { day: Math.min(day, total), total, marked: e.marks.some(m => m.date === today.value) }
})
</script>

<template>
  <div class="grid-main">
    <div class="stack">
      <div v-if="!checkin" class="energy">
        <div>
          <strong>Как ты сегодня?</strong>
          <p class="muted">Отметь сон и нагрузку, и план подстроится под тебя. Можно пропустить.</p>
        </div>
        <a class="go" href="#checkin">Сделать чек-ин →</a>
      </div>
      <BaseNote v-else-if="plan.light">
        {{ lightReason }} Сегодня план полегче: меньше дел, длиннее перерывы и есть пауза. Остальное подождёт.
      </BaseNote>
      <p v-else class="muted">
        По чек-ину: сон {{ String(checkin.sleep).replace('.', ',') }} ч, нагрузка {{ LOADS[checkin.load] }}. Обычный день.
      </p>

      <BaseCard
        eyebrow="Твой день"
        title="Расписание и дела"
        :sub="`${lessons.length ? plural(lessons.length, ['пара', 'пары', 'пар']) : 'Пар нет'}, ${taskCount ? plural(taskCount, ['дело', 'дела', 'дел']) + ' в плане' : 'дел в плане нет'}. Пары на месте, дела встали в свободные окна.`"
      >
        <template #actions><a class="go" href="#schedule">Расписание ↗</a></template>

        <p v-if="!lessons.length && !state.tasks.some(t => !t.done)" class="muted">
          День пока пустой. Добавь пары во вкладке <a class="go" href="#schedule">Расписание</a>
          или дела во вкладке <a class="go" href="#tasks">Дела</a>.
        </p>
        <BaseNote v-else-if="dayOver">На сегодня всё. Отдыхай, остальное подождёт до завтра.</BaseNote>

        <div class="timeline">
          <div
            v-for="it in plan.items"
            :key="it.type + it.start"
            class="trow"
            :class="{ past: it.end <= now && !dayOver, current: it.start <= now && now < it.end }"
          >
            <span class="time">{{ toTime(it.start) }}</span>

            <div v-if="it.type === 'lesson'" class="event">
              <div>
                <b>{{ it.lesson.title }}</b>
                <small v-if="lessonMeta(it.lesson)">{{ lessonMeta(it.lesson) }}</small>
              </div>
              <em>{{ duration(it.end - it.start) }}</em>
            </div>

            <div v-else-if="it.type === 'task'" class="event task">
              <div class="task-body">
                <b>{{ it.task.title }}</b>
                <small v-if="taskMeta(it.task)">{{ taskMeta(it.task) }}</small>
                <div v-if="started.includes(it.task.id)" class="first">
                  <span class="eyebrow">Первый шаг</span>
                  <p>{{ it.task.firstStep || 'Выбери самое маленькое действие и начни с него' }}</p>
                  <p class="started">Ты начал, продолжай в своём ритме</p>
                </div>
                <small v-else-if="it.task.firstStep">Первый шаг: {{ it.task.firstStep }}</small>
                <div class="actions">
                  <BaseButton v-if="!started.includes(it.task.id)" variant="ghost" @click="start(it.task.id)">Начать</BaseButton>
                  <BaseButton variant="link" @click="updateTask(it.task.id, { done: true })">Готово</BaseButton>
                  <BaseButton variant="link" @click="skipForToday(it.task.id)">Не сегодня</BaseButton>
                </div>
              </div>
              <em>{{ duration(it.end - it.start) }}</em>
            </div>

            <div v-else-if="it.type === 'pause'" class="event pause">
              <div>
                <b>Пауза</b>
                <small>Пройдись, попей воды или просто ничего не делай</small>
              </div>
              <em>{{ duration(it.end - it.start) }}</em>
            </div>

            <div v-else class="event free">
              <div>
                <b>Окно</b>
                <small>Кофе, пройтись или спокойно посидеть</small>
              </div>
              <em>{{ duration(it.end - it.start) }}</em>
            </div>
          </div>
        </div>
      </BaseCard>
    </div>

    <div class="stack">
      <BaseCard
        v-if="plan.left.length || skippedTasks.length"
        eyebrow="Подождёт"
        title="Не на сегодня"
        :sub="plan.light ? 'Сегодня бережём силы, эти дела можно сделать позже.' : 'Не влезли в свободное время или ты сам их отложил.'"
      >
        <div class="stack small-gap">
          <div v-for="t in plan.left" :key="t.id" class="later">
            <div>
              <b>{{ t.title }}</b>
              <small :class="{ warn: !t.flexible }">
                {{ duration(Number(t.minutes) || 30) }} · {{ t.flexible ? 'можно завтра' : 'обязательное, но не влезло в окна' }}
              </small>
            </div>
          </div>
          <div v-for="t in skippedTasks" :key="t.id" class="later">
            <div>
              <b>{{ t.title }}</b>
              <small>отложено тобой</small>
            </div>
            <BaseButton variant="link" @click="unskipForToday(t.id)">Вернуть</BaseButton>
          </div>
        </div>
      </BaseCard>

      <BaseCard v-if="experiment" eyebrow="Твой эксперимент" :title="experiment.question" :sub="experiment.change">
        <div class="row">
          <span class="pill">День {{ experimentDay.day }} из {{ experimentDay.total }}</span>
          <span v-if="experimentDay.marked" class="muted">Сегодня отмечено ✓</span>
          <a v-else class="go" href="#experiment">Отметить результат →</a>
        </div>
      </BaseCard>
      <BaseCard v-else eyebrow="Эксперимент" title="Попробуй одно изменение" sub="Например, пять минут на старт. Неделю пробуешь и смотришь, помогает ли именно тебе.">
        <a class="go" href="#experiment">Выбрать эксперимент →</a>
      </BaseCard>
    </div>
  </div>
</template>

<style scoped>
.energy {
  background: var(--c-hint);
  border-radius: 17px;
  padding: 17px 19px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.energy strong { font: 700 15px var(--font-head); }
.energy p { margin-top: 4px; }

.go {
  color: var(--c-primary);
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}
.go:hover { text-decoration: underline; }

.timeline { display: grid; gap: 7px; }
.trow { display: grid; grid-template-columns: 49px 1fr; gap: 10px; align-items: start; }
.trow.past { opacity: 0.5; }
.time { font-size: 12px; color: var(--c-faint); padding-top: 10px; }
.current .time { color: var(--c-accent-deep); font-weight: 700; }

.event {
  background: var(--c-bg);
  border-radius: var(--radius-sm);
  padding: 9px 11px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.current .event { box-shadow: inset 3px 0 0 var(--c-accent); }
.event.task { background: var(--c-hint); }
.event.pause { background: var(--c-accent-soft); }
.event.free { background: none; border: 1px dashed var(--c-border); }
.event b { font-size: 13px; }
.event small { display: block; color: var(--c-muted); font-size: 12px; margin-top: 3px; }
.event em { font-style: normal; color: var(--c-muted); font-size: 12px; white-space: nowrap; }

.task-body { min-width: 0; }
.first { background: var(--c-card); border-radius: 9px; padding: 9px; margin-top: 8px; font-size: 13px; }
.first p { margin-top: 3px; }
.started { color: #567863; font-weight: 700; font-size: 12px; }
.actions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }

.small-gap { gap: 8px; }
.later {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-sm);
  padding: 9px 11px;
}
.later b { font-size: 13px; }
.later small { display: block; color: var(--c-muted); font-size: 12px; margin-top: 2px; }
.later small.warn { color: var(--c-accent-deep); }

@media (max-width: 680px) {
  .energy { flex-direction: column; align-items: flex-start; }
}
</style>
