<template>
  <div class="container">
    <p class="text-center">
      <img src="/img/allegro-project.png" class="img-fluid">
    </p>

    <h2>Documentation</h2>
    <p>
      See the <a href="/api/index.html">API documentation</a><br>
    </p>

    <h2>Installation</h2>
    <highlightjs language="bash" :code="consts.installationCommand"/>

    <h2>Usage</h2>
    <div>
      1. An AudioNode to analyze. So something like this :
      <highlightjs language="xml" :code="consts.usageStepOne"/>

      2. Connect the AudioNode to the AudioContext and create an AudioContext.createScriptProcessor().
      <highlightjs language="js" :code="consts.usageStepTwo"/>

      3. Now you have just to configure the tool and attach it to the audioprocess event like this :
      <highlightjs language="js" :code="consts.usageStepThree"/>

      <hr>

      You can check <a href="https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/src/views/routes">the code base</a> of the github pages to have a real usage of the library.
    </div>

    <h2>Contribution, Community & Support</h2>
    <p>
      See the <a href="https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/contributing.md">contribution guide lines</a><br>
      See the <a href="https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/code-of-conduct.md">code of conduct</a>
    </p>

    <h2>Changelog</h2>
    <p>
      See the <a href="https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/changelog.md">changelog</a>
    </p>

    <h2>Licence</h2>
    <p>
      This project is under <a href="https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/licence.md">MIT licence</a>
    </p>

    <h2>Credits</h2>
    <p>
      This library was been inspired from <a href="https://github.com/tornqvist/bpm-detective">Tornqvist</a> project which also based on <a href="http://joesul.li/van/beat-detection-using-web-audio/">Joe Sullivan's algorithm</a>. Thank you to both of them
    </p>

    <h2>Final</h2>
    <p>
      If this helped you in any way, you can always leave me a tip here :)
      <br>
      BTC <strong>36eHnxCRUDfWNFEx3YebRGw12WeutjkBBt**</strong>
      <br>
      ETH <strong>0x0F8b4F026624150e9F6267bFD93C372eb98e3010**</strong>
    </p>
  </div>
</template>

<script>
  import hljsVuePlugin from '@highlightjs/vue-plugin';
  import * as consts from '../../consts.js';

  export default {
    name: 'Home',
    components: {
        highlightjs: hljsVuePlugin.component
    },
    data() {
      return {
        consts
      };
    }
  };
</script>
