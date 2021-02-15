<template>
  <base-section
    id="contact"
    space="56"
  >
    <v-container>
      <v-row justify="space-between">
        <v-col
          cols="12"
          md="5"
        >
          <base-business-info
            title="FIND ME ON SOCIAL MEDIA"
          />
        </v-col>

        <v-col
          cols="12"
          md="6"
        >
          <base-contact-form title="SEND ME YOUR MESSAGE" />
        </v-col>
      </v-row>
    </v-container>
  </base-section>
</template>

<script>
  export default {
    name: 'SectionKeepInTouch',
  }
</script>
