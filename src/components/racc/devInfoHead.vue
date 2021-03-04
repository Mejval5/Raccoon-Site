<template>
  <div>
    <base-heading
      size="display-2"
      class="mb-0"
      space="0"
    >
      {{ name }}
    </base-heading>
    <base-subtitle
      space="6"
      class="secondaryText"
    >
      {{ title }}
    </base-subtitle>
    <base-subtitle
      v-for="(s, i) in socialMedia"
      :key="i"
      space="3"
      class="primaryText"
      mobile-size="subtitle-2"
    >
      <a
        class="text-decoration-none"
        :href="`https://www.${s.link}`"
        target="_blank"
      >
        {{ s.name }} - <span class="linkText"> {{ s.link }} </span>
      </a>
    </base-subtitle>
  </div>
</template>

<script>
  export default {
    props: {
      text: String,
      name: String,
      title: String,
      socialMedia: Array,
    },
  }
</script>

<style>

</style>
