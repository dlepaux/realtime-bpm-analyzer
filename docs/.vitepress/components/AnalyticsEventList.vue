<script setup lang="ts">
// The website privacy page's list of analytics events, printed from the catalogue that track()
// is typed from (RBA-154), so the page can't describe an event the site doesn't send, or miss one.
import { EVENTS } from '../tools/analytics-events'

const events = Object.entries(EVENTS).map(([name, spec]) => ({ name, privacy: spec.privacy }))
</script>

<template>
  <ul class="analytics-events">
    <li
      v-for="event in events"
      :key="event.name"
    >
      {{ event.privacy }} <code>{{ event.name }}</code>
    </li>
  </ul>
</template>
