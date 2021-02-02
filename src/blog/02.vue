<template>
  <base-section
    id="features"
    class="secondary"
    style="width: 100%;"
  >
    <v-responsive
      class="mx-auto"
    >
      <v-container fluid>
        <v-row>
          <v-col
            v-for="card in cards"
            :key="card.title"
            cols="12"
            sm="4"
            md="3"
          >
            <base-info-card
              align="center"
              dark
              v-bind="card"
              :text="id"
            />
          </v-col>
        </v-row>
      </v-container>
    </v-responsive>
  </base-section>
</template>

<script>
  export default {
    name: 'SectionFeatures',

    metaInfo: {
      title: 'Super lol',
      imgSrc: 'assets/cube/IMG_0325.jpg',
    },

    props: {
      id: String,
      date: {
        type: Number,
        default: Date.now(),
      },
    },

    data: () => ({
      cards: [
        {
          icon: 'mdi-keyboard-outline',
          title: 'Programming',
          text: 'Efficiently unleash media information without cross-media value. Quickly maximize value timely deliverables schemas.',
        },
        {
          icon: 'mdi-camera-outline',
          title: 'Photography',
          text: 'Efficiently unleash media information without cross-media value. Quickly maximize value timely deliverables schemas.',
        },
        {
          icon: 'mdi-pencil-outline',
          title: 'Brand Making',
          text: 'Efficiently unleash media information without cross-media value. Quickly maximize value timely deliverables schemas.',
        },
        {
          icon: 'mdi-puzzle-outline',
          title: '24/7 Support',
          text: 'Efficiently unleash media information without cross-media value. Quickly maximize value timely deliverables schemas.',
        },
      ],
    }),
  }
</script>
