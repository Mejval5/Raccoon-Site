<template>
  <div>
    <v-row>
      <v-col>
        <base-heading
          size="display-2"
          class="mb-0 "
          space="0"
        >
          {{ name }}
        </base-heading>
      </v-col>
    </v-row>
    <v-row>
      <v-col
        cols="12"
      >
        <base-subtitle
          class="text-h6"
        >
          {{ title }}
        </base-subtitle>
      </v-col>
      <v-col
        cols="6"
      >
        <base-subtitle
          v-for="(s, i) in socialMedia"
          :key="i"
          space="3"
          class="primaryText text-subtitle-1 d-flex align-items-center"
          mobile-size="subtitle-2"
        >
          <a
            class="text-decoration-none d-flex align-items-center"
            :href="`https://www.${s.link}`"
            target="_blank"
            style=""
          >
          
            <img
              style="-webkit-user-select: none; height:32px; width:32px; margin: auto;background-color: hsl(0, 0%, 0%, 0%);transition: background-color 300ms;"
              :src="s.icon"
            >
            <span class="linkText pl-4"> {{ s.link }} </span>
          </a>
        </base-subtitle>
      </v-col>
      <v-col
        cols="12"
        lg="3"
      >
        <div
          class="d-flex flex-column"
          :class="{'align-center justify-center': $vuetify.breakpoint.lgAndUp}"
          style="height: 100%;"
        >
          <base-subtitle
            :class="{'text-h4 text-center': $vuetify.breakpoint.lgAndUp, 'text-h4': $vuetify.breakpoint.md, 'text-h5': $vuetify.breakpoint.smAndDown}"
            space="0"
          >
            <a
              href="/CV_Daniel_Necesal.pdf"
              class="text-decoration-none"
            >
              <span class="linkText">DOWNLOAD<br v-show="$vuetify.breakpoint.lgAndUp"> RESUME</span>
            </a>
          </base-subtitle>
        </div>
      </v-col>
    </v-row>
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
