<template>
  <nav class="navbar navbar-expand-lg navbar-light bg-light">
    <div class="container-fluid">
      <router-link class="navbar-brand" to="/">
          <img src="/favicon.png" alt="" height="24" class="d-inline-block align-text-top">
          Allegro
      </router-link>
      <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarSupportedContent" aria-controls="navbarSupportedContent" aria-expanded="false" aria-label="Toggle navigation">
          <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="navbarSupportedContent">
        <ul class="navbar-nav me-auto mb-2 mb-lg-0">
          <li class="nav-item dropdown">
            <a class="nav-link dropdown-toggle" href="#" id="navbarDropdown2" role="button" data-bs-toggle="dropdown" aria-expanded="false">
              Exemples
            </a>
            <ul class="dropdown-menu" aria-labelledby="navbarDropdown2">
              <li v-for="(label, route) in routeExemples" :key="route">
                <router-link class="dropdown-item" :to="`/${route}`">{{ label }}</router-link>
              </li>
            </ul>
          </li>
          <li class="nav-item">
            <router-link class="nav-link" to="/how-it-works">How it works</router-link>
          </li>
          <li class="nav-item">
            <a class="nav-link" :href="`${vueConfig.publicPath}api`">API</a>
          </li>
        </ul>
      </div>
    </div>
  </nav>
</template>

<script>
  import * as consts from '../../consts.js';
  import vueConfig from '../../../vue.config.cjs';

  export default {
    name: 'Navigation',
    data() {
      return {
        routeExemples: consts.routeExemples,
        vueConfig
      }
    }
  }
</script>

<style scoped>
  .nav-link {
    cursor: pointer;
  }
</style>
