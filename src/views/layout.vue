<template>
  <navigation></navigation>
  <div class="d-flex flex-grow-1 flex-column">
    <div class="flex-grow-1 bg-white">
      <div class="container mt-3">
        <router-view></router-view>
      </div>
    </div>
    <end-of-page></end-of-page>
  </div>
</template>

<script>
  import navigation from '../components/navigation/navigation.vue';
  import endOfPage from '../components/footer/end-of-page.vue';

  export default {
    name: 'Layout',
    components: {navigation, endOfPage},
  };
</script>
