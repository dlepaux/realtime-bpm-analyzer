<template>
  <div class="container pb-3">
    <p class="text-center">
      <img src="https://dlepaux.github.io/realtime-bpm-analyzer/img/allegro-project.png" class="img-fluid">
    </p>

    <h2>Installation</h2>
    <highlightjs language="bash" :code="consts.installationCommand"/>

    <h2>Usage</h2>
    <div>
      <p>1. An AudioNode to analyze. So something like this :</p>
      <highlightjs class="ms-3" language="xml" :code="consts.usageStepOne"/>

      <p>2. Connect the AudioNode to the AudioContext and create an AudioContext.createScriptProcessor().</p>
      <highlightjs class="ms-3" language="js" :code="consts.usageStepTwo"/>

      <p>3. Now you have just to configure the tool and attach it to the audioprocess event like this :</p>
      <highlightjs class="ms-3" language="js" :code="consts.usageStepThree"/>
    </div>

    <h2 class="mt-3">Examples</h2>
    <div>
      Please check the examples in this website and the <router-link to="/how-it-works">How it works</router-link> page.<br>
      You can as well check <a href="https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/src/views/routes">the code base</a> of the github pages to see how to use the library for those specific cases.
    </div>

    <h2 class="mt-3">Contribution, Community & Support</h2>
    <p>
      Please ensure to aknowledge the <a href="https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/contributing.md">contribution guide lines</a> and <a href="https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/code-of-conduct.md">code of conduct</a>.
    </p>

    <p>
      Once you've read the document mentioned above, don't hesitate to <a href="https://gitter.im/realtime-bpm-analyzer/Lobby">chat with the community</a> or <a href="https://github.com/dlepaux/realtime-bpm-analyzer/issues">submit an issue</a>.
    </p>

    <h2 class="mt-3">Changelog</h2>
    <p>
      See the <a href="https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/changelog.md">changelog</a>.
    </p>

    <h2 class="mt-3">Licence</h2>
    <p>
      This project is under <a href="https://github.com/dlepaux/realtime-bpm-analyzer/tree/main/licence.md">MIT licence</a>.
    </p>

    <h2 class="mt-3">Credits</h2>
    <p>
      This library was been inspired from <a href="https://github.com/tornqvist/bpm-detective">Tornqvist</a> project which also based on <a href="http://joesul.li/van/beat-detection-using-web-audio/">Joe Sullivan's algorithm</a>. Thank you to both of them.
    </p>

    <h2 class="mt-3">Final</h2>
    <p>
      If this helped you in any way, you can always leave me a tip here :)
      <br>
      BTC <strong>36eHnxCRUDfWNFEx3YebRGw12WeutjkBBt</strong>
      <br>
      ETH <strong>0x0F8b4F026624150e9F6267bFD93C372eb98e3010</strong>
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
