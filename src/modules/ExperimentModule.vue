<script setup>
import { computed, ref, watch } from "vue";
import {
  state,
  addExperiment,
  addMark,
  finishExperiment,
  todayStr,
  addDays,
  parseDate,
} from "../store.js";
import BaseCard from "../components/BaseCard.vue";
import BaseButton from "../components/BaseButton.vue";
import BaseChip from "../components/BaseChip.vue";
import BaseNote from "../components/BaseNote.vue";

const presets = [
  {
    id: "start",
    icon: "🌱",
    title: "Пять минут на старт",
    description:
      "Начать с пяти минут, а дальше продолжить или остановиться по желанию.",
    question:
      "Становится ли легче приступить, если договориться с собой только о первых пяти минутах?",
    change:
      "Выбери одно дело и поработай над ним первые пять минут. Дальше — по желанию, без таймера.",
    note: "Отмечай, удалось ли начать и захотелось ли продолжить.",
  },
  {
    id: "thoughts",
    icon: "🌙",
    title: "Выгрузить мысли перед сном",
    description: "Записать висящие дела и выбрать одно главное на завтра.",
    question:
      "Помогает ли запись дел и выбор одного главного на завтра завершить день спокойнее?",
    change: "Перед сном запиши висящие дела и выбери одно главное на завтра.",
    note: "Отмечай, стало ли проще закончить день и начать утро.",
  },
  {
    id: "place",
    icon: "🪴",
    title: "Сменить рабочее место",
    description: "Попробовать другой стол, комнату или библиотеку.",
    question:
      "Влияет ли другое рабочее место на то, насколько легко приступить к делу?",
    change:
      "Для одного занятия попробуй другое место: стол, комнату или библиотеку.",
    note: "Отмечай, насколько легко было включиться в дело.",
  },
  {
    id: "distraction",
    icon: "📵",
    title: "Убрать одно отвлечение",
    description: "На время дела убрать телефон или уведомления.",
    question: "Помогает ли одно небольшое изменение меньше отвлекаться?",
    change: "На время одного дела убери телефон или отключи уведомления.",
    note: "Отмечай, насколько легко было сосредоточиться.",
  },
  {
    id: "next",
    icon: "🧭",
    title: "Оставить себе «что дальше»",
    description: "Перед паузой записать следующий конкретный шаг.",
    question: "Помогает ли запись следующего шага быстрее вернуться к делу?",
    change: "Перед паузой запиши один следующий конкретный шаг.",
    note: "Отмечай, насколько легко было продолжить после паузы.",
  },
  {
    id: "custom",
    icon: "✎",
    title: "Свой вариант",
    description: "Выбери то, что подходит именно тебе.",
    question: "",
    change: "",
    note: "Отмечай силы и то, помогло ли выбранное изменение.",
  },
];

const step = ref(1);
const selectedPreset = ref("");
const question = ref("");
const change = ref("");
const duration = ref(7);
const summaryId = ref("");
const energy = ref(null);
const helped = ref("");

const activeExperiment = computed(
  () => state.experiments.find((item) => item.status === "active") || null,
);
const pastExperiments = computed(() =>
  state.experiments
    .filter((item) => item.status === "finished")
    .slice()
    .sort((a, b) => b.startDate.localeCompare(a.startDate)),
);
const showingSummary = computed(() =>
  Boolean(
    activeExperiment.value &&
    (summaryId.value === activeExperiment.value.id ||
      todayStr() > activeExperiment.value.endDate),
  ),
);
const currentPreset = computed(
  () => presets.find((item) => item.id === selectedPreset.value) || null,
);
const startDate = computed(() => todayStr());
const endDate = computed(() => addDays(startDate.value, duration.value - 1));
const activeMarks = computed(() => activeExperiment.value?.marks || []);
const todayMark = computed(
  () => activeMarks.value.find((mark) => mark.date === todayStr()) || null,
);
const markedCount = computed(() => activeMarks.value.length);
const periodLength = computed(() =>
  activeExperiment.value
    ? daysBetween(
        activeExperiment.value.startDate,
        activeExperiment.value.endDate,
      ) + 1
    : 0,
);
const activeDay = computed(() =>
  activeExperiment.value
    ? Math.max(
        1,
        Math.min(
          periodLength.value,
          daysBetween(activeExperiment.value.startDate, todayStr()) + 1,
        ),
      )
    : 0,
);
const averageEnergy = computed(() =>
  average(activeMarks.value.map((mark) => mark.energy)),
);
const helpedCount = computed(
  () => activeMarks.value.filter((mark) => mark.helped === "yes").length,
);
const helpedMarks = computed(() =>
  activeMarks.value.filter((mark) => mark.helped === "yes"),
);
const otherMarks = computed(() =>
  activeMarks.value.filter((mark) => mark.helped !== "yes"),
);
const splitObservation = computed(() =>
  helpedMarks.value.length >= 2 && otherMarks.value.length >= 2
    ? `В дни, когда помогало, силы в среднем ${average(helpedMarks.value.map((mark) => mark.energy))}, в остальные ${average(otherMarks.value.map((mark) => mark.energy))}.`
    : "Данных пока мало, но уже есть над чем подумать.",
);

watch(
  todayMark,
  (mark) => {
    energy.value = mark?.energy ?? null;
    helped.value = mark?.helped ?? "";
  },
  { immediate: true },
);

function choosePreset(preset) {
  selectedPreset.value = preset.id;
  question.value = preset.question;
  change.value = preset.change;
}

function daysBetween(from, to) {
  return Math.round((parseDate(to) - parseDate(from)) / 86400000);
}

function average(values) {
  if (!values.length) return "—";
  return (
    values.reduce((sum, value) => sum + Number(value), 0) / values.length
  ).toFixed(1);
}

function formatDate(date) {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" })
    .format(parseDate(date))
    .replace(".", "");
}

function conclusionLabel(conclusion) {
  return (
    { keep: "Оставил", change: "Поменял", other: "Попробую другое" }[
      conclusion
    ] || "—"
  );
}

function markFor(date) {
  return activeMarks.value.find((mark) => mark.date === date);
}

function saveTodayMark() {
  if (!energy.value || !helped.value || !activeExperiment.value) return;
  addMark(activeExperiment.value.id, {
    date: todayStr(),
    energy: energy.value,
    helped: helped.value,
  });
}

function finishEarly() {
  if (activeExperiment.value) summaryId.value = activeExperiment.value.id;
}

function saveConclusion(value) {
  if (!activeExperiment.value) return;
  finishExperiment(activeExperiment.value.id, value);
  summaryId.value = activeExperiment.value.id;
}

function newExperiment() {
  step.value = 1;
  selectedPreset.value = "";
  question.value = "";
  change.value = "";
  duration.value = 7;
  summaryId.value = "";
}

function startExperiment() {
  if (!question.value.trim() || !change.value.trim()) return;
  addExperiment({
    question: question.value.trim(),
    change: change.value.trim(),
    startDate: startDate.value,
    endDate: endDate.value,
  });
}
</script>

<template>
  <div class="module-stack">
    <template v-if="!activeExperiment">
      <BaseCard
        eyebrow="Личный эксперимент"
        title="Что хочется проверить?"
        sub="Одно небольшое изменение — и наблюдение о том, как оно работает именно для тебя."
      >
        <div class="wizard-progress">
          <span class="eyebrow">Шаг {{ step }} из 3</span>
          <div class="progress-track" aria-hidden="true">
            <span :style="{ width: `${(step / 3) * 100}%` }"></span>
          </div>
        </div>

        <div v-if="step === 1" class="step-content">
          <p class="step-heading">Выбери идею или придумай свою</p>
          <div class="preset-grid">
            <button
              v-for="preset in presets"
              :key="preset.id"
              type="button"
              class="preset-card"
              :class="{ selected: selectedPreset === preset.id }"
              :aria-pressed="selectedPreset === preset.id"
              @click="choosePreset(preset)"
            >
              <span class="preset-icon" aria-hidden="true">{{
                preset.icon
              }}</span>
              <strong>{{ preset.title }}</strong>
              <span class="muted">{{ preset.description }}</span>
            </button>
          </div>
          <BaseNote v-if="currentPreset" class="preset-note">
            <template v-if="currentPreset.id !== 'custom'"
              ><strong>Вопрос:</strong>
              {{ question || "Добавь свою гипотезу ниже." }}<br
            /></template>
            <strong>Попробуй:</strong>
            {{ change || "Опиши, что именно будешь делать иначе." }}<br />
            <strong>Отмечай:</strong> {{ currentPreset.note }}
          </BaseNote>
          <div class="form-fields">
            <label class="field">
              <span>Какую гипотезу хочешь проверить?</span>
              <textarea
                v-model="question"
                rows="2"
                placeholder="Например: мне легче начать, если заранее выбрать первый шаг"
              ></textarea>
            </label>
            <label class="field">
              <span>Что именно ты будешь делать?</span>
              <textarea
                v-model="change"
                rows="2"
                placeholder="Опиши одно небольшое изменение"
              ></textarea>
            </label>
          </div>
        </div>

        <div v-else-if="step === 2" class="step-content form-fields">
          <label class="field">
            <span>Что именно ты будешь делать?</span>
            <textarea
              v-model="change"
              rows="3"
              placeholder="Опиши одно небольшое изменение"
            ></textarea>
          </label>
          <div class="field">
            <span>На какой срок?</span>
            <div class="chips">
              <BaseChip :active="duration === 3" @click="duration = 3"
                >3 дня</BaseChip
              >
              <BaseChip :active="duration === 7" @click="duration = 7"
                >1 неделя</BaseChip
              >
              <BaseChip :active="duration === 14" @click="duration = 14"
                >2 недели</BaseChip
              >
            </div>
          </div>
          <p class="muted">Начало — сегодня, {{ formatDate(startDate) }}.</p>
        </div>

        <div v-else class="step-content review-block">
          <div>
            <span class="eyebrow">Гипотеза</span>
            <p>{{ question }}</p>
          </div>
          <div>
            <span class="eyebrow">Изменение</span>
            <p>{{ change }}</p>
          </div>
          <div>
            <span class="eyebrow">Период</span>
            <p>
              С {{ formatDate(startDate) }} по {{ formatDate(endDate) }} ·
              {{ duration }} дней
            </p>
          </div>
          <BaseNote
            >Можно остановиться раньше. Решение и темп остаются за
            тобой.</BaseNote
          >
        </div>

        <div class="wizard-actions">
          <BaseButton
            variant="ghost"
            :disabled="step === 1"
            @click="step = Math.max(1, step - 1)"
            >Назад</BaseButton
          >
          <BaseButton
            v-if="step < 3"
            :disabled="
              (step === 1 && !question.trim()) || (step === 2 && !change.trim())
            "
            @click="step += 1"
            >Дальше</BaseButton
          >
          <BaseButton
            v-else
            :disabled="!question.trim() || !change.trim()"
            @click="startExperiment"
            >Начать эксперимент</BaseButton
          >
        </div>
      </BaseCard>
    </template>

    <template v-else-if="showingSummary">
      <BaseCard
        eyebrow="Без оценок и правильных ответов"
        title="Личный итог"
        :sub="activeExperiment.question"
      >
        <div class="summary-stats">
          <div class="stat-item">
            <strong>{{ markedCount }} из {{ periodLength }}</strong
            ><span>дней отмечено</span>
          </div>
          <div class="stat-item">
            <strong>{{ averageEnergy }}</strong
            ><span>средние силы</span>
          </div>
          <div class="stat-item">
            <strong>{{ helpedCount }}</strong
            ><span>раз помогло</span>
          </div>
        </div>
        <p class="summary-observation">{{ splitObservation }}</p>
        <div class="decision-block">
          <template v-if="activeExperiment.status === 'active'">
            <p class="step-heading">Что решаешь?</p>
            <div class="chips">
              <BaseChip @click="saveConclusion('keep')"
                >Оставить привычку</BaseChip
              >
              <BaseChip @click="saveConclusion('change')">Поменять её</BaseChip>
              <BaseChip @click="saveConclusion('other')"
                >Попробовать другое</BaseChip
              >
            </div>
          </template>
          <template v-else>
            <BaseNote>Записано. Решение за тобой.</BaseNote>
            <BaseButton class="new-button" @click="newExperiment"
              >Новый эксперимент</BaseButton
            >
          </template>
        </div>
      </BaseCard>
      <BaseCard
        v-if="activeExperiment.status === 'active'"
        title="Твоё изменение"
        :sub="activeExperiment.change"
      >
        <BaseButton variant="ghost" @click="summaryId = ''"
          >Вернуться к эксперименту</BaseButton
        >
      </BaseCard>
    </template>

    <template v-else>
      <BaseCard
        eyebrow="Идёт эксперимент"
        :title="activeExperiment.question"
        :sub="activeExperiment.change"
      >
        <template #actions
          ><span class="pill"
            >День {{ activeDay }} из {{ periodLength }}</span
          ></template
        >
        <div class="mark-form">
          <p class="step-heading">Отметка за сегодня</p>
          <div class="field">
            <span>Сколько сегодня сил?</span>
            <div
              class="energy-options"
              role="group"
              aria-label="Сколько сегодня сил?"
            >
              <button
                v-for="value in 5"
                :key="value"
                type="button"
                class="energy-button"
                :class="{ selected: energy === value }"
                :aria-pressed="energy === value"
                @click="energy = value"
              >
                {{ value }}
              </button>
            </div>
            <span class="muted">1 — мало · 5 — много</span>
          </div>
          <div class="field">
            <span>Помогло ли изменение?</span>
            <div class="chips">
              <BaseChip :active="helped === 'yes'" @click="helped = 'yes'"
                >Да</BaseChip
              >
              <BaseChip :active="helped === 'no'" @click="helped = 'no'"
                >Нет</BaseChip
              >
              <BaseChip :active="helped === 'unsure'" @click="helped = 'unsure'"
                >Пока не понятно</BaseChip
              >
            </div>
          </div>
          <BaseButton :disabled="!energy || !helped" @click="saveTodayMark">{{
            todayMark ? "Обновить отметку" : "Отметить"
          }}</BaseButton>
        </div>
        <div class="day-track" aria-label="Отметки за дни эксперимента">
          <div v-for="offset in periodLength" :key="offset" class="day-item">
            <span
              class="day-dot"
              :class="{
                marked: markFor(
                  addDays(activeExperiment.startDate, offset - 1),
                ),
                today:
                  addDays(activeExperiment.startDate, offset - 1) ===
                  todayStr(),
                future:
                  addDays(activeExperiment.startDate, offset - 1) > todayStr(),
              }"
              :title="
                formatDate(addDays(activeExperiment.startDate, offset - 1))
              "
            ></span>
            <span class="day-caption">{{ offset }}</span>
          </div>
        </div>
        <div class="progress-legend muted">
          <span><i class="legend-dot marked"></i> отмечено</span
          ><span><i class="legend-dot"></i> пропущено</span
          ><span><i class="legend-dot future"></i> впереди</span>
        </div>
        <div class="early-finish">
          <BaseButton variant="ghost" @click="finishEarly"
            >Завершить раньше</BaseButton
          >
        </div>
      </BaseCard>
      <BaseNote>Это наблюдение о своём опыте, а не медицинский вывод.</BaseNote>
    </template>

    <BaseCard
      v-if="pastExperiments.length"
      eyebrow="Твои заметки"
      title="Прошлые эксперименты"
    >
      <ul class="history-list">
        <li v-for="item in pastExperiments" :key="item.id" class="history-item">
          <strong>{{ item.question }}</strong>
          <span class="muted"
            >{{ formatDate(item.startDate) }}–{{ formatDate(item.endDate) }} ·
            {{ item.marks.length }} дней отмечено</span
          >
          <span class="history-decision">{{
            conclusionLabel(item.conclusion)
          }}</span>
        </li>
      </ul>
    </BaseCard>
    <p class="disclaimer muted">
      Это наблюдение о своём опыте, а не медицинский вывод.
    </p>
  </div>
</template>

<style scoped>
.module-stack {
  display: grid;
  gap: 15px;
  min-width: 0;
}
.wizard-progress {
  display: grid;
  gap: 8px;
  margin: 2px 0 20px;
}
.progress-track {
  height: 5px;
  overflow: hidden;
  background: var(--c-bg);
  border-radius: 99px;
}
.progress-track span {
  display: block;
  height: 100%;
  background: var(--c-primary);
  border-radius: inherit;
  transition: width 160ms ease;
}
.step-content {
  display: grid;
  gap: 16px;
}
.step-heading {
  font-weight: 700;
}
.preset-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.preset-card {
  display: grid;
  align-content: start;
  justify-items: start;
  gap: 7px;
  min-width: 0;
  padding: 13px;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-sm);
  background: var(--c-card);
  text-align: left;
  transition:
    border-color 120ms ease,
    background 120ms ease;
}
.preset-card:hover {
  border-color: var(--c-primary);
}
.preset-card.selected {
  border: 2px solid var(--c-primary);
  padding: 12px;
  background: var(--c-primary-soft);
}
.preset-card strong {
  font-size: 13px;
  line-height: 1.35;
}
.preset-icon {
  font-size: 20px;
}
.preset-note {
  margin-top: 2px;
}
.form-fields {
  display: grid;
  gap: 13px;
}
.field textarea {
  width: 100%;
  resize: vertical;
}
.wizard-actions {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 20px;
  padding-top: 15px;
  border-top: 1px solid var(--c-border);
}
.review-block {
  padding: 15px;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-sm);
  background: var(--c-bg);
}
.review-block > div {
  display: grid;
  gap: 4px;
}
.summary-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.stat-item {
  display: grid;
  gap: 3px;
  padding: 13px;
  border-radius: var(--radius-sm);
  background: var(--c-hint);
}
.stat-item strong {
  font: 750 22px/1.2 var(--font-head);
  color: var(--c-primary);
}
.stat-item span {
  color: var(--c-muted);
  font-size: 12px;
}
.summary-observation {
  margin-top: 15px;
  padding: 13px;
  border-radius: var(--radius-sm);
  background: var(--c-accent-soft);
  color: var(--c-accent-deep);
}
.decision-block {
  display: grid;
  justify-items: start;
  gap: 12px;
  margin-top: 18px;
}
.new-button {
  margin-top: 2px;
}
.mark-form {
  display: grid;
  gap: 16px;
  max-width: 540px;
}
.energy-options {
  display: flex;
  gap: 8px;
}
.energy-button {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border: 1px solid var(--c-border);
  border-radius: 50%;
  background: var(--c-card);
  font-weight: 700;
}
.energy-button:hover,
.energy-button.selected {
  border-color: var(--c-primary);
  background: var(--c-primary-soft);
  color: var(--c-primary);
}
.day-track {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 22px;
  padding-top: 17px;
  border-top: 1px solid var(--c-border);
}
.day-item {
  display: grid;
  justify-items: center;
  gap: 4px;
  min-width: 18px;
}
.day-dot,
.legend-dot {
  display: block;
  width: 13px;
  height: 13px;
  border: 1px solid var(--c-faint);
  border-radius: 50%;
  background: transparent;
}
.day-dot.marked,
.legend-dot.marked {
  border-color: var(--c-primary);
  background: var(--c-primary);
}
.day-dot.today {
  outline: 2px solid var(--c-accent);
  outline-offset: 2px;
}
.day-dot.future,
.legend-dot.future {
  border-color: var(--c-border);
  background: var(--c-bg);
}
.day-caption {
  color: var(--c-muted);
  font-size: 10px;
}
.progress-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
}
.progress-legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.legend-dot {
  width: 10px;
  height: 10px;
}
.early-finish {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}
.history-list {
  display: grid;
  gap: 0;
  padding: 0;
  margin: 0;
  list-style: none;
}
.history-item {
  display: grid;
  gap: 3px;
  padding: 12px 0;
  border-bottom: 1px solid var(--c-border);
}
.history-item:first-child {
  padding-top: 0;
}
.history-item:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}
.history-decision {
  color: var(--c-primary);
  font-size: 12px;
  font-weight: 700;
}
.disclaimer {
  text-align: center;
}

@media (max-width: 720px) {
  .preset-grid {
    grid-template-columns: 1fr;
  }
  .preset-card {
    grid-template-columns: auto 1fr;
    align-items: center;
  }
  .preset-card .muted {
    grid-column: 2;
  }
  .summary-stats {
    grid-template-columns: 1fr;
  }
  .stat-item {
    grid-template-columns: minmax(75px, auto) 1fr;
    align-items: baseline;
  }
  .day-track {
    gap: 10px;
  }
}
</style>
