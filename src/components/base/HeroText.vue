<template>
  <v-container
    :class="get_container_class"
    fluid
  >
    <v-row
      class="align-content-stretch mx-auto"
    >
      <v-col
        class="pa-0"
      >
        <v-card
          :class="get_class"
          :style="get_style"
        >
          <base-heading
            title="Welcome"
            class="primaryText"
          />

          <base-body
            class="secondaryText"
          >
            My name is Daniel Nečesal. I am an indie game developer based in Brno, Czech Republic. <br>
            On this site I would like to share my older projects as well as the progress of my current projects. <br> <br>
            My current main project is the
            <base-btn
              class="px-1 mb-1 linkText subtitle-1"
              style="min-width: 0;"
              height="auto"
              text
              rounded
              :tile="false"
              to="/octomancer"
            >
              Octomancer
            </base-btn>
          </base-body>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
  export default {
    name: 'HeroText',

    props: {
      elevated: {
        type: Boolean,
        default: false,
      },
    },

    computed: {
      get_class () {
        return this.elevated ? 'pa-5 rounded elevation1 elevation-0' : 'pa-5 overlay rounded elevation-0'
      },
      get_style () {
        return this.elevated ? '' : 'width: fit-content;'
      },
      get_container_class () {
        return this.elevated ? 'fill-height align-start mt-5 px-0' : 'fill-height align-start mt-5 px-0 pl-5'
      },
    },
  }
</script>
