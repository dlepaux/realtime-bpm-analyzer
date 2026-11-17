<script setup lang="ts">
import { LEAD_CAPTURE } from '../tools/extension-config'

// A plain HTML form posted straight to listmonk, so it works without JavaScript.
// listmonk sends the confirmation email (double opt-in) before the address joins
// the list. The empty `nonce` field is listmonk's honeypot against form bots.
const capture = LEAD_CAPTURE
</script>

<template>
  <section
    v-if="capture"
    class="ext-optin"
    aria-labelledby="ext-optin-title"
  >
    <h2 id="ext-optin-title">
      Hear when Pro is ready
    </h2>
    <form
      class="ext-optin-form"
      method="post"
      :action="capture.formUrl"
    >
      <input
        type="hidden"
        name="l"
        :value="capture.listUuid"
      />
      <input
        type="hidden"
        name="nonce"
        value=""
      />
      <label
        class="ext-optin-label"
        for="ext-optin-email"
      >Email address</label>
      <div class="ext-optin-row">
        <input
          id="ext-optin-email"
          class="ext-optin-input"
          type="email"
          name="email"
          autocomplete="email"
          required
          maxlength="254"
        />
        <button
          class="tt-btn tt-btn-primary"
          type="submit"
        >
          Notify me
        </button>
      </div>
      <p class="ext-optin-consent">
        One email when Pro launches, nothing else. You confirm the address from the first
        email, and every email has a one-click unsubscribe. The list is kept on our own
        server, never shared. See <a href="/website-privacy">website privacy</a>.
      </p>
    </form>
  </section>
</template>
