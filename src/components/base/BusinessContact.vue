<template>
  <v-theme-provider :dark="dark">
    <div>
      <base-info-card
        :title="title"
      >
        <slot />
      </base-info-card>
      <v-container
        v-for="({ icon, text, html, iconColor, title: t }, i) in business"
        :key="i"
      >
        <v-row
          align="center"
          :justify="$vuetify.breakpoint.mdAndUp ? 'start' : 'center'"
        >
          <v-col
            cols="4"
            md="2"
            sm="auto"
          >
            <base-avatar-card
              :key="i"
              :icon="icon"
              :outlined="false"
              :title="!dense ? t : undefined"
              color="transparent"
              :icon-color="iconColor"
              horizontal
              space="0"
              :href="html"
              target="_blank"
            />
          </v-col>
          <v-col
            cols="8"
            sm="auto"
            md="8"
          >
            <a
              class="title text-decoration-none primaryText"
              style="justify-content: center;"
              :href="html"
              target="_blank"
              v-html="text"
            />
          </v-col>
        </v-row>
        <v-row
          v-if="i < business.length - 1"
          :key="`divider-${i}`"
          :justify="$vuetify.breakpoint.mdAndUp ? 'start' : 'center'"
        >
          <v-col
            cols="10"
            lg="10"
            md="10"
            sm="10"
          >
            <v-divider
              class="my-1"
            />
          </v-col>
        </v-row>
      </v-container>
    </div>
  </v-theme-provider>
</template>

<script>
  export default {
    name: 'BaseBusinessContact',

    props: {
      dark: Boolean,
      dense: Boolean,
      title: String,
      business: Array,
    },
  }
</script>
