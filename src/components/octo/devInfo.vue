<template>
  <v-fade-transition>
    <div>
      <v-row
        align="end"
      >
        <v-col
          cols="12"
          sm="8"
          order="1"
        >
          <racc-dev-info-head
            :name="devInfo.name"
            :title="devInfo.title"
            :social-media="devInfo.socialMedia"
          />
        </v-col>
        <v-col
          cols="12"
          sm="4"
          align-self="stretch"
          order="-1"
          order-sm="2"
        >
          <v-img
            eager
            width="200px"
            class="clip mx-auto"
            :src="require(`@/${devInfo.pic}`)"
          >
            <template v-slot:placeholder>
              <v-row
                class="fill-height ma-0"
                align="center"
                justify="center"
              >
                <v-progress-circular
                  indeterminate
                  color="grey lighten-5"
                >
                  <v-sheet
                    width="200px"
                    height="200px"
                    color="#0c2d3daa"
                    class="clip"
                  />
                </v-progress-circular>
              </v-row>
            </template>
          </v-img>
        </v-col>
      </v-row>
      <v-row
        align="center"
      >
        <v-col
          cols="12"
        >
          <racc-my-info />
        </v-col>
      </v-row>
    </div>
  </v-fade-transition>
</template>

<script>
  export default {
    props: {
      devInfo: Object,
    },
  }
</script>

<style>
.clip {
  clip-path: circle(50% at 50% 50%);
}
</style>
