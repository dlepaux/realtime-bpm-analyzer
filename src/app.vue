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

h2 {
  padding-bottom: .3em;
  margin-top: .5rem;
  border-bottom: 1px solid #d9d9d9;
}

pre code.hljs {
  background: #f6f8fa;
  border-radius: 6px;
}
</style>
