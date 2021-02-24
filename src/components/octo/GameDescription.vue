<template>
  <div>
    <v-row>
      <v-col align-self="center">
        <base-title
          title="Octomancer"
          size="display-1"
          mobile-size="headline"
          class="text-uppercase octoPrimaryText"
          space="0"
        />
      </v-col>
    </v-row>

    <v-row>
      <v-col>
        <base-body
          class="octoSecondaryText"
          :text="text"
          space="3"
        />
        <v-divider />
      </v-col>
    </v-row>
    <v-row>
      <v-col>
        <v-row>
          <v-col>
            <base-subtitle
              title="Gay features"
              class="octoPrimaryText"
              size="title"
              mobile-size="subtitle-1"
              space="0"
            />
          </v-col>
        </v-row>
        <octo-item
          text="ahoj"
        />
        <octo-item
          text="girls with nice vagaigai"
        />
        <octo-item
          text="two boys one slut"
        />
        <octo-item
          text="hair chicks"
        />
        <v-divider />
      </v-col>
    </v-row>
  </div>
</template>

<script>
  export default {
    name: 'GameDescription',

    data () {
      return {
        text: `This game is about fucking girls with large
        unstoppable tentacles. The only person who could enjoy this human excrement of a
        game are professional perverts like us. Hope you like it. Share and rate it with your grandma
        after your next family orgy, you sick fuck!`,
      }
    },
  }
</script>

<style>

</style>
