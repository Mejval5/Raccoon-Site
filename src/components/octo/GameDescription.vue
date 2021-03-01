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
          :html="bodyText"
          space="4"
        />
        <v-divider />
      </v-col>
    </v-row>
    <v-row>
      <v-col>
        <v-row>
          <v-col>
            <base-subtitle
              title="Features:"
              class="octoPrimaryText"
              size="title"
              mobile-size="subtitle-1"
              space="0"
            />
          </v-col>
        </v-row>
        <octo-item
          v-for="(f, i) in features"
          :key="i"
          :html="f.html"
          :icon="f.icon"
        />
        <div class="pb-3" />
        <v-divider />
      </v-col>
    </v-row>
    <v-row
      align="center"
      justify="center"
      class="d-flex d-md-none"
    >
      <v-col cols="auto">
        <octo-closed-beta-button
          class="text-wrap mt-4 mb-4"
        />
      </v-col>
    </v-row>
    <v-row>
      <v-col>
        <v-divider />
        <div class="pb-2" />
        <v-row
          align="center"
          justify="center"
          dense
          no-gutters
        >
          <v-col
            class="d-none d-lg-block"
            cols="2"
            lg="1"
          >
            <base-subtitle
              title="Genre:"
              class="octoPrimaryText"
              size="title"
              mobile-size="subtitle-1"
              space="0"
            />
          </v-col>
          <v-col>
            <octo-genre />
          </v-col>
        </v-row>
        <div class="pb-3" />
        <v-divider />
      </v-col>
    </v-row>
    <v-row>
      <v-col>
        <octo-tags />
        <div class="pb-3" />
        <v-divider class="d-none d-md-block" />
      </v-col>
    </v-row>
    <v-row
      align="center"
      justify="center"
      class="d-none d-md-flex"
    >
      <v-col
        cols="auto"
        align-self="center"
      >
        <octo-closed-beta-button
          class="text-wrap mt-2 mb-2"
        />
      </v-col>
    </v-row>
  </div>
</template>

<script>
  export default {
    name: 'GameDescription',

    data () {
      return {
        bodyText: `Combine magical crystals, build your underwater cove, and fight against ever increasing odds in this
        fresh mix of arcade, platformer, and multiplayer game. <br>
        Compete against players all over the globe to become the most powerful Octomancer in the Shalow Sea. <br>
        Merge large gems together to increase your magical powers and unlock magical tomes.
        `,
        features: [
          { icon: 'mdi-shield-outline', html: '<b>BUILD DEFENSES:</b> Secure your cove from enemy octopuses!' },
          { icon: 'mdi-treasure-chest', html: '<b>UPGRADE YOUR LOOT:</b> Merge crystals to create the most valuable tresure!' },
          { icon: 'mdi-diamond-stone', html: '<b>CAPTURE PRETTY CRYSTALS:</b> Compete with players all around the world!' },
          { icon: 'mdi-auto-fix', html: '<b>GROW IN POWER:</b> Become a feared Octomancer in the depths of the shallow sea!' },
        ],
      }
    },
  }
</script>

<style>

</style>
