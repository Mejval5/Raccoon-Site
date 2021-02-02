<template>
      <v-container
      fluid
      class="secondary pa-sm-0"
      >
        <v-row
        class="ma-0"
        dense
        >
          <v-col
          cols="12"
          md="8"
          >
          <div
            class="text-h5 text-md-h4 font-weight-bold text--primary"
          >
          {{title}}
          </div>
          </v-col>
          <v-spacer />
          <v-col
          cols="12"
          md="2"
          align-self="end"
          :style="$vuetify.breakpoint.mdAndUp ? 'text-align: end;' : 'text-align: start;'"
          >
          <div
          v-text=formated_date()
          >
          </div>
          </v-col>
        </v-row>
      </v-container>
</template>

<script>
  export default {
    name: 'SectionFeatures',

    props: {
      date: Number,
      title: String,
    },

    methods: {
      formated_date () {
        const [_month, _date, _year] = new Date(this.date).toLocaleDateString('en-US').split('/')
        return _date.toString() + '. ' + _month.toString() + '. ' + _year.toString()
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
