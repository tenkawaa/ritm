<script setup>
import { computed, ref, watch } from 'vue'
import { state, addExperiment, addMark, finishExperiment, todayStr, addDays, parseDate } from '../store.js'
import BaseCard from '../components/BaseCard.vue'
import BaseButton from '../components/BaseButton.vue'
import BaseChip from '../components/BaseChip.vue'
import BaseNote from '../components/BaseNote.vue'

const presets = [
  { id: 'start', icon: '🌱', title: 'Пять минут на старт', description: 'Выбери дело и удели ему первые пять минут.', change: 'Выбери одно дело и поработай над ним первые пять минут.' },
  { id: 'thoughts', icon: '🌙', title: 'Выгрузить мысли перед сном', description: 'Записать висящие дела и выбрать одно главное на завтра.', change: 'Перед сном запиши висящие дела и выбери одно главное на завтра.' },
  { id: 'place', icon: '🪴', title: 'Сменить рабочее место', description: 'Попробовать другой стол, комнату или библиотеку.', change: 'Для одного занятия попробуй другое место: стол, комнату или библиотеку.' },
  { id: 'distraction', icon: '📵', title: 'Убрать одно отвлечение', description: 'На время дела убрать телефон или уведомления.', change: 'На время одного дела убери телефон или отключи уведомления.' },
  { id: 'next', icon: '🧭', title: 'Оставить себе «что дальше»', description: 'Перед паузой записать следующий конкретный шаг.', change: 'Перед паузой запиши один следующий конкретный шаг.' },
  { id: 'custom', icon: '✏️', title: 'Свой вариант', description: 'Опиши коротко, что хочешь попробовать.', change: '' }
]
const IDEAS_KEY = 'ritm_experiment_ideas_v1'
const NOTES_KEY = 'ritm_experiment_notes_v1'

function loadSavedNotes() {
  try {
    const saved = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}')
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {}
  } catch {
    return {}
  }
}

function loadSavedIdeas() {
  try {
    const saved = JSON.parse(localStorage.getItem(IDEAS_KEY) || '[]')
    return Array.isArray(saved) ? saved.filter(item => item && item.id && item.title && item.change) : []
  } catch {
    return []
  }
}

const step = ref(1)
const selectedPreset = ref('')
const question = ref('')
const change = ref('')
const customIdea = ref('')
const experimentNotes = ref('')
const savedIdeas = ref(loadSavedIdeas())
const savedNotes = ref(loadSavedNotes())
const duration = ref(7)
const summaryId = ref('')
const resultId = ref('')
const pendingDeleteId = ref('')
const historyOpen = ref(false)
const energy = ref(null)
const helped = ref('')

const activeExperiment = computed(() => state.experiments.find(item => item.status === 'active') || null)
const finishedResult = computed(() => state.experiments.find(item => item.id === resultId.value && item.status === 'finished') || null)
const summaryExperiment = computed(() => activeExperiment.value || finishedResult.value)
const pastExperiments = computed(() => state.experiments.filter(item => item.status === 'finished').slice().sort((a, b) => a.startDate.localeCompare(b.startDate)))
const showingSummary = computed(() => Boolean(summaryExperiment.value && (finishedResult.value || summaryId.value === activeExperiment.value?.id || todayStr() > activeExperiment.value?.endDate)))
const currentPreset = computed(() => [...presets, ...savedIdeas.value].find(item => item.id === selectedPreset.value) || null)
const ownPreset = presets.find(item => item.id === 'custom')
const startDate = computed(() => todayStr())
const endDate = computed(() => addDays(startDate.value, duration.value - 1))
const activeMarks = computed(() => activeExperiment.value?.marks || [])
const summaryMarks = computed(() => summaryExperiment.value?.marks || [])
const todayMark = computed(() => activeMarks.value.find(mark => mark.date === todayStr()) || null)
const markedCount = computed(() => summaryMarks.value.length)
const periodLength = computed(() => summaryExperiment.value ? daysBetween(summaryExperiment.value.startDate, summaryExperiment.value.endDate) + 1 : 0)
const activeDay = computed(() => activeExperiment.value ? Math.max(1, Math.min(periodLength.value, daysBetween(activeExperiment.value.startDate, todayStr()) + 1)) : 0)
const averageEnergy = computed(() => average(summaryMarks.value.map(mark => mark.energy)))
const energySummary = computed(() => summaryMarks.value.length === 1 ? `${summaryMarks.value[0].energy} из 5` : averageEnergy.value)
const energyCaption = computed(() => summaryMarks.value.length === 1 ? 'оценка сил за 1 день' : `средние силы из 5 · ${markedCount.value} дней`)
const helpedCount = computed(() => summaryMarks.value.filter(mark => mark.helped === 'yes').length)
const notHelpedCount = computed(() => summaryMarks.value.filter(mark => mark.helped === 'no').length)
const unsureCount = computed(() => summaryMarks.value.filter(mark => mark.helped === 'unsure').length)
const helpedMarks = computed(() => summaryMarks.value.filter(mark => mark.helped === 'yes'))
const otherMarks = computed(() => summaryMarks.value.filter(mark => mark.helped !== 'yes'))
const splitObservation = computed(() => {
  if (!summaryMarks.value.length) return ''
  return helpedMarks.value.length >= 2 && otherMarks.value.length >= 2
    ? `В дни, когда помогало, силы в среднем ${average(helpedMarks.value.map(mark => mark.energy))} из 5, в остальные ${average(otherMarks.value.map(mark => mark.energy))} из 5.`
    : 'Отметок пока мало, чтобы сравнить дни между собой.'
})

watch(savedIdeas, ideas => {
  try { localStorage.setItem(IDEAS_KEY, JSON.stringify(ideas)) } catch {}
}, { deep: true })

watch(() => activeExperiment.value?.id, id => {
  experimentNotes.value = id ? String(savedNotes.value[id] || '') : ''
}, { immediate: true })

watch(customIdea, value => {
  if (selectedPreset.value === 'custom') change.value = value
})

watch([experimentNotes, () => activeExperiment.value?.id], ([note, id]) => {
  if (!id) return
  savedNotes.value = { ...savedNotes.value, [id]: note }
  try { localStorage.setItem(NOTES_KEY, JSON.stringify(savedNotes.value)) } catch {}
})

watch(todayMark, mark => {
  energy.value = mark?.energy ?? null
  helped.value = mark?.helped ?? ''
}, { immediate: true })

function choosePreset(preset) {
  selectedPreset.value = preset.id
  question.value = preset.id === 'custom' ? 'Свой вариант' : preset.title
  change.value = preset.change || ''
  customIdea.value = preset.id === 'custom' ? '' : preset.change
}

function saveCurrentIdea() {
  const cleanChange = customIdea.value.trim()
  if (!cleanChange) return
  const existing = savedIdeas.value.find(item => item.change === cleanChange)
  if (existing) return
  const title = cleanChange.length > 48 ? `${cleanChange.slice(0, 45).trimEnd()}…` : cleanChange
  savedIdeas.value.push({ id: `idea-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, title, description: cleanChange, question: 'Свой вариант', change: cleanChange })
}

function deletePastExperiment(id) {
  state.experiments = state.experiments.filter(item => !(item.id === id && item.status === 'finished'))
  if (resultId.value === id) resultId.value = ''
  pendingDeleteId.value = ''
}

function removeSavedIdea(id) {
  savedIdeas.value = savedIdeas.value.filter(item => item.id !== id)
  if (selectedPreset.value === id) selectedPreset.value = 'custom'
}

function daysBetween(from, to) {
  return Math.round((parseDate(to) - parseDate(from)) / 86400000)
}

function average(values) {
  if (!values.length) return '—'
  return (values.reduce((sum, value) => sum + Number(value), 0) / values.length).toFixed(1)
}

function formatDate(date) {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(parseDate(date)).replace('.', '')
}

function conclusionLabel(conclusion) {
  return ({ keep: 'Оставил', change: 'Поменял', other: 'Попробую другое' })[conclusion] || '—'
}

function helpedSummary(experiment) {
  if (!experiment.marks.length) return 'Отметок пока нет'
  const count = experiment.marks.filter(mark => mark.helped === 'yes').length
  return `Помогло в ${count} из ${experiment.marks.length} отмеченных дней`
}

function markFor(date) {
  return activeMarks.value.find(mark => mark.date === date)
}

function saveTodayMark() {
  if (!energy.value || !helped.value || !activeExperiment.value) return
  addMark(activeExperiment.value.id, { date: todayStr(), energy: energy.value, helped: helped.value })
}

function finishEarly() {
  if (activeExperiment.value) summaryId.value = activeExperiment.value.id
}

function saveConclusion(value) {
  if (!activeExperiment.value) return
  const id = activeExperiment.value.id
  finishExperiment(id, value)
  resultId.value = id
  summaryId.value = id
}

function newExperiment() {
  step.value = 1
  selectedPreset.value = ''
  question.value = ''
  change.value = ''
  customIdea.value = ''
  duration.value = 7
  summaryId.value = ''
  resultId.value = ''
}

function startExperiment() {
  if (!change.value.trim()) return
  if (selectedPreset.value === 'custom') saveCurrentIdea()
  addExperiment({
    question: question.value.trim() || 'Свой вариант',
    change: change.value.trim(),
    startDate: startDate.value,
    endDate: endDate.value
  })
}
</script>

<template>
  <div class="module-stack">
    <template v-if="!activeExperiment && !finishedResult">
      <BaseCard eyebrow="Личный эксперимент" title="Что попробуешь?" sub="Выбери приём и посмотри, как он впишется в твой день.">
        <div class="wizard-progress">
          <span class="eyebrow">Шаг {{ step }} из 3</span>
          <div class="progress-track" aria-hidden="true"><span :style="{ width: `${step / 3 * 100}%` }"></span></div>
        </div>

        <div v-if="step === 1" class="step-content">
          <p class="step-heading">Выбери одну идею</p>
          <div class="preset-grid">
            <button v-for="preset in presets.filter(item => item.id !== 'custom')" :key="preset.id" type="button" class="preset-card" :class="{ selected: selectedPreset === preset.id }" :aria-pressed="selectedPreset === preset.id" @click="choosePreset(preset)">
              <span class="preset-icon" aria-hidden="true">{{ preset.icon }}</span>
              <strong>{{ preset.title }}</strong>
              <span class="muted">{{ preset.description }}</span>
            </button>
            <div v-for="idea in savedIdeas" :key="idea.id" class="saved-idea-card" :class="{ selected: selectedPreset === idea.id }">
              <button type="button" class="preset-card saved-idea-select" :aria-pressed="selectedPreset === idea.id" @click="choosePreset(idea)">
                <span class="preset-icon" aria-hidden="true">✏️</span>
                <strong>{{ idea.title }}</strong>
                <span class="muted">Твоя идея</span>
              </button>
              <button type="button" class="remove-idea" :aria-label="`Удалить идею «${idea.title}»`" title="Удалить идею" @click="removeSavedIdea(idea.id)">×</button>
            </div>
            <button type="button" class="preset-card" :class="{ selected: selectedPreset === ownPreset.id }" :aria-pressed="selectedPreset === ownPreset.id" @click="choosePreset(ownPreset)">
              <span class="preset-icon" aria-hidden="true">{{ ownPreset.icon }}</span>
              <strong>{{ ownPreset.title }}</strong>
              <span class="muted">{{ ownPreset.description }}</span>
            </button>
          </div>
          <BaseNote v-if="currentPreset" class="preset-note">
            <strong>{{ currentPreset.title }}</strong><br>
            {{ currentPreset.description }}
          </BaseNote>
          <label v-if="selectedPreset === 'custom'" class="field">
            <span>Что хочешь попробовать?</span>
            <textarea v-model="customIdea" rows="2" placeholder="Опиши приём своими словами"></textarea>
          </label>
        </div>

        <div v-else-if="step === 2" class="step-content form-fields">
          <div class="field">
            <span>На какой срок?</span>
            <div class="chips">
              <BaseChip :active="duration === 3" @click="duration = 3">3 дня</BaseChip>
              <BaseChip :active="duration === 7" @click="duration = 7">1 неделя</BaseChip>
              <BaseChip :active="duration === 14" @click="duration = 14">2 недели</BaseChip>
            </div>
          </div>
          <BaseNote>Пропуски — это нормально. Ничего не нужно наверстывать.</BaseNote>
          <p class="muted">Начало — сегодня, {{ formatDate(startDate) }}.</p>
        </div>

        <div v-else class="step-content review-block">
          <div><span class="eyebrow">Приём</span><p>{{ question }}</p></div>
          <div><span class="eyebrow">Как это выглядит</span><p>{{ change }}</p></div>
          <div><span class="eyebrow">Период</span><p>С {{ formatDate(startDate) }} по {{ formatDate(endDate) }} · {{ duration }} дней</p></div>
          <BaseNote v-if="selectedPreset === 'custom'">После старта этот вариант сохранится в карточках для следующего раза.</BaseNote>
        </div>

        <div class="wizard-actions">
          <BaseButton v-if="step > 1" variant="ghost" @click="step = Math.max(1, step - 1)">Назад</BaseButton>
          <BaseButton v-if="step < 3" :disabled="(step === 1 && !selectedPreset) || (step === 1 && selectedPreset === 'custom' && !customIdea.trim())" @click="step += 1">Дальше</BaseButton>
          <BaseButton v-else :disabled="!change.trim()" @click="startExperiment">Начать эксперимент</BaseButton>
        </div>
      </BaseCard>
    </template>

    <template v-else-if="showingSummary">
      <BaseCard eyebrow="Без оценок и правильных ответов" title="Личный итог" :sub="summaryExperiment.question">
        <div class="summary-stats">
          <div class="stat-item"><strong>{{ markedCount }} из {{ periodLength }}</strong><span>дней отмечено</span></div>
          <div class="stat-item"><strong>{{ energySummary }}</strong><span>{{ energyCaption }}</span></div>
          <div class="stat-item"><strong>{{ helpedCount }} / {{ markedCount }}</strong><span>ответов «Подошёл»</span></div>
        </div>
        <p v-if="summaryMarks.length" class="response-breakdown muted">Ответы о приёме: подошёл — {{ helpedCount }}, не подошёл — {{ notHelpedCount }}, пока не ясно — {{ unsureCount }}.</p>
        <p v-if="summaryMarks.length" class="summary-observation">{{ splitObservation }}</p>
        <div class="decision-block">
          <template v-if="summaryExperiment.status === 'active'">
            <p class="step-heading">Что решаешь?</p>
            <div class="chips">
              <BaseChip @click="saveConclusion('keep')">Оставить привычку</BaseChip>
              <BaseChip @click="saveConclusion('change')">Поменять её</BaseChip>
              <BaseChip @click="saveConclusion('other')">Попробовать другое</BaseChip>
            </div>
          </template>
          <template v-else>
            <BaseNote>Записано. Решение за тобой.</BaseNote>
            <BaseButton class="new-button" @click="newExperiment">Новый эксперимент</BaseButton>
          </template>
        </div>
      </BaseCard>
      <BaseCard v-if="summaryExperiment.status === 'active'" title="Твой приём" :sub="summaryExperiment.change">
        <BaseButton variant="ghost" @click="summaryId = ''">Вернуться к эксперименту</BaseButton>
      </BaseCard>
    </template>

    <template v-else>
      <BaseCard eyebrow="Идёт эксперимент" :title="activeExperiment.question" :sub="activeExperiment.change">
        <template #actions><span class="pill">День {{ activeDay }} из {{ periodLength }}</span></template>
        <div class="mark-form">
          <p class="step-heading">Отметка за сегодня</p>
          <div class="field">
            <span>Сколько у тебя сегодня сил? Оцени от 1 до 5</span>
            <div class="energy-options" role="group" aria-label="Сколько сегодня сил?">
              <button v-for="value in 5" :key="value" type="button" class="energy-button" :class="{ selected: energy === value }" :aria-pressed="energy === value" @click="energy = value">{{ value }}</button>
            </div>
            <span class="muted">1 — почти нет сил · 5 — сил много</span>
          </div>
          <div class="field">
            <span>Насколько тебе подошёл этот приём сегодня?</span>
            <div class="chips">
              <BaseChip :active="helped === 'yes'" @click="helped = 'yes'">Подошёл</BaseChip>
              <BaseChip :active="helped === 'no'" @click="helped = 'no'">Не подошёл</BaseChip>
              <BaseChip :active="helped === 'unsure'" @click="helped = 'unsure'">Пока не ясно</BaseChip>
            </div>
          </div>
          <BaseButton :disabled="!energy || !helped" @click="saveTodayMark">{{ todayMark ? 'Обновить отметку' : 'Отметить' }}</BaseButton>
        </div>
        <label class="field notes-field">
          <span>Заметки для себя</span>
          <textarea v-model="experimentNotes" rows="3" placeholder="Можно записать любые наблюдения — заметка сохранится автоматически"></textarea>
        </label>
        <div class="day-track" aria-label="Отметки за дни эксперимента">
          <div v-for="offset in periodLength" :key="offset" class="day-item">
            <span class="day-dot" :class="{ marked: markFor(addDays(activeExperiment.startDate, offset - 1)), today: addDays(activeExperiment.startDate, offset - 1) === todayStr(), future: addDays(activeExperiment.startDate, offset - 1) > todayStr() }" :title="formatDate(addDays(activeExperiment.startDate, offset - 1))"></span>
            <span class="day-caption">{{ offset }}</span>
          </div>
        </div>
        <div class="progress-legend muted"><span><i class="legend-dot marked"></i> отмечено</span><span><i class="legend-dot"></i> пропущено</span><span><i class="legend-dot future"></i> впереди</span></div>
        <div class="early-finish"><BaseButton variant="ghost" @click="finishEarly">Завершить раньше</BaseButton></div>
      </BaseCard>
    </template>

    <BaseCard v-if="pastExperiments.length" eyebrow="Твои заметки" title="Прошлые эксперименты">
      <button type="button" class="history-toggle" :aria-expanded="historyOpen" @click="historyOpen = !historyOpen">
        {{ historyOpen ? 'Скрыть записи' : `Показать записи · ${pastExperiments.length}` }}
      </button>
      <ul v-if="historyOpen" class="history-list">
          <li v-for="item in pastExperiments" :key="item.id" class="history-item">
            <div class="history-title-row">
              <strong>{{ item.question }}</strong>
              <button type="button" class="remove-note" @click="pendingDeleteId = pendingDeleteId === item.id ? '' : item.id">Удалить</button>
            </div>
            <span class="muted">{{ formatDate(item.startDate) }}–{{ formatDate(item.endDate) }} · {{ item.marks.length }} дней отмечено</span>
            <details class="history-detail">
              <summary>Посмотреть заметки</summary>
              <p><strong>Пробовал:</strong> {{ item.change }}</p>
              <p>{{ helpedSummary(item) }} · средние силы {{ average(item.marks.map(mark => mark.energy)) }} из 5 по {{ item.marks.length }} отметкам</p>
              <p><strong>Решение:</strong> {{ conclusionLabel(item.conclusion) }}</p>
              <p v-if="savedNotes[item.id]"><strong>Твои заметки:</strong> {{ savedNotes[item.id] }}</p>
            </details>
            <div v-if="pendingDeleteId === item.id" class="delete-confirm">
              <span>Удалить эту заметку?</span>
              <button type="button" @click="deletePastExperiment(item.id)">Удалить</button>
              <button type="button" @click="pendingDeleteId = ''">Отмена</button>
            </div>
          </li>
        </ul>
    </BaseCard>
  </div>
</template>

<style scoped>
.module-stack { display: grid; gap: 15px; min-width: 0; }
.wizard-progress { display: grid; gap: 8px; margin: 2px 0 20px; }
.progress-track { height: 5px; overflow: hidden; background: var(--c-bg); border-radius: 99px; }
.progress-track span { display: block; height: 100%; background: var(--c-primary); border-radius: inherit; transition: width 160ms ease; }
.step-content { display: grid; gap: 16px; }
.step-heading { font-weight: 700; }
.preset-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.preset-card { display: grid; align-content: start; justify-items: start; gap: 7px; min-width: 0; padding: 13px; border: 1px solid var(--c-border); border-radius: var(--radius-sm); background: var(--c-card); text-align: left; transition: border-color 120ms ease, background 120ms ease; }
.preset-card:hover { border-color: var(--c-primary); }
.preset-card.selected { border: 2px solid var(--c-primary); padding: 12px; background: var(--c-primary-soft); }
.preset-card strong { font-size: 15px; line-height: 1.35; }
.preset-icon { display: inline-grid; place-items: center; width: 28px; height: 28px; font-size: 20px; line-height: 1; }
.preset-note { margin-top: 2px; }
.saved-idea-card { position: relative; min-width: 0; }
.saved-idea-select { width: 100%; min-height: 100%; padding-right: 32px; }
.saved-idea-card.selected .saved-idea-select { border: 2px solid var(--c-primary); padding: 12px 31px 12px 12px; background: var(--c-primary-soft); }
.saved-idea-select strong { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; font-size: 15px; line-height: 1.35; }
.remove-idea { position: absolute; top: 6px; right: 6px; display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 50%; background: var(--c-card); color: var(--c-muted); font-size: 18px; line-height: 1; }
.remove-idea:hover { color: var(--c-primary); }
.form-fields { display: grid; gap: 13px; }
.field textarea { width: 100%; resize: vertical; }
.notes-field { max-width: 540px; margin-top: 18px; }
.wizard-actions { display: flex; justify-content: space-between; gap: 10px; margin-top: 20px; padding-top: 15px; border-top: 1px solid var(--c-border); }
.review-block { padding: 15px; border: 1px solid var(--c-border); border-radius: var(--radius-sm); background: var(--c-bg); }
.review-block > div { display: grid; gap: 4px; }
.summary-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.stat-item { display: grid; gap: 3px; padding: 13px; border-radius: var(--radius-sm); background: var(--c-hint); }
.stat-item strong { font: 750 22px/1.2 var(--font-head); color: var(--c-primary); }
.stat-item span { color: var(--c-muted); font-size: 14px; }
.response-breakdown { margin-top: 12px; font-size: 14px; line-height: 1.5; }
.summary-observation { margin-top: 15px; padding: 13px; border-radius: var(--radius-sm); background: var(--c-accent-soft); color: var(--c-accent-deep); }
.decision-block { display: grid; justify-items: start; gap: 12px; margin-top: 18px; }
.new-button { margin-top: 2px; }
.mark-form { display: grid; gap: 16px; max-width: 540px; }
.energy-options { display: flex; gap: 8px; }
.energy-button { display: grid; place-items: center; width: 42px; height: 42px; border: 1px solid var(--c-border); border-radius: 50%; background: var(--c-card); font-weight: 700; }
.energy-button:hover, .energy-button.selected { border-color: var(--c-primary); background: var(--c-primary-soft); color: var(--c-primary); }
.day-track { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 22px; padding-top: 17px; border-top: 1px solid var(--c-border); }
.day-item { display: grid; justify-items: center; gap: 4px; min-width: 18px; }
.day-dot, .legend-dot { display: block; width: 13px; height: 13px; border: 1px solid var(--c-faint); border-radius: 50%; background: transparent; }
.day-dot.marked, .legend-dot.marked { border-color: var(--c-primary); background: var(--c-primary); }
.day-dot.today { outline: 2px solid var(--c-accent); outline-offset: 2px; }
.day-dot.future, .legend-dot.future { border-color: var(--c-border); background: var(--c-bg); }
.day-caption { color: var(--c-muted); font-size: 12px; }
.progress-legend { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; }
.progress-legend span { display: inline-flex; align-items: center; gap: 5px; }
.legend-dot { width: 10px; height: 10px; }
.early-finish { display: flex; justify-content: flex-end; margin-top: 16px; }
.history-list { display: grid; gap: 0; padding: 0; margin: 0; list-style: none; }
.history-toggle { width: fit-content; padding: 4px 0; border: 0; background: none; color: var(--c-primary); font-size: 14px; font-weight: 700; text-align: left; cursor: pointer; }
.history-item { display: grid; gap: 3px; padding: 12px 0; border-bottom: 1px solid var(--c-border); }
.history-item:first-child { padding-top: 0; }
.history-item:last-child { padding-bottom: 0; border-bottom: 0; }
.history-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.remove-note { flex: none; padding: 3px 5px; border: 0; background: none; color: var(--c-faint); font-size: 13px; }
.remove-note:hover { color: var(--c-primary); }
.delete-confirm { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 6px; color: var(--c-muted); font-size: 14px; }
.delete-confirm button { padding: 4px 7px; border: 1px solid var(--c-border); border-radius: var(--radius-sm); background: var(--c-card); font-size: 13px; }
.history-detail { color: var(--c-muted); font-size: 14px; }
.history-detail summary { width: fit-content; color: var(--c-primary); font-weight: 700; cursor: pointer; }
.history-detail p { margin-top: 6px; }
@media (max-width: 720px) {
  .preset-grid { grid-template-columns: 1fr; gap: 8px; }
  .preset-card { grid-template-columns: auto 1fr; align-items: center; }
  .preset-card strong { font-size: 14px; }
  .preset-card .muted { display: none; }
  .saved-idea-select { padding: 10px 30px 10px 10px; }
  .saved-idea-card.selected .saved-idea-select { padding: 9px 29px 9px 9px; }
  .saved-idea-select strong { font-size: 14px; }
  .saved-idea-select .muted { display: none; }
  .summary-stats { grid-template-columns: 1fr; }
  .stat-item { grid-template-columns: minmax(75px, auto) 1fr; align-items: baseline; }
  .day-track { gap: 10px; }
}
</style>



