<template>
  <v-row
    align="center"
  >
    <v-col
      cols="12"
      sm="6"
      :order="reverseOrder"
    >
      <octo-dev-info-text
        :text="devInfo.text"
        :name="devInfo.name"
        :title="devInfo.title"
        :social-media="devInfo.socialMedia"
      />
    </v-col>
    <v-col
      cols="12"
      sm="6"
      align-self="stretch"
      order="-1"
      order-sm="2"
    >
      <v-img
        eager
        width="30vh"
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
                width="30vh"
                height="30vh"
                color="#0c2d3daa"
                class="clip"
              />
            </v-progress-circular>
          </v-row>
        </template>
      </v-img>
    </v-col>
  </v-row>
</template>

<script>
  export default {
    props: {
      devInfo: Object,
      reverse: Boolean,
    },
    computed: {
      reverseOrder () {
        return this.reverse ? '3' : '1'
      },
    },
  }
</script>

<style>
.clip {
  clip-path: circle(50% at 50% 50%);
}
</style>
