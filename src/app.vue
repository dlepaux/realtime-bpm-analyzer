<template>
  <div id="app" class="d-flex flex-column">
    <layout></layout>
  </div>
</template>

<script>
  import layout from './views/layout.vue';

  export default {
    name: 'App',
    components: {layout},
  };
</script>

<style>
html,
body,
#root,
#app {
  height: 100%;
  min-height: 100%;
}
</style>
