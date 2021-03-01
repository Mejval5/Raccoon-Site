<template>
  <div class="text-center">
    <v-dialog
      v-model="dialog"
      width="500"
    >
      <v-card
        class="popUp"
        rounded
      >
        <v-card-title class="primaryText">
          {{ text }}
        </v-card-title>

        <v-card-actions>
          <v-spacer />
          <v-btn
            class="linkTextBright"
            text
            @click="dialog = false"
          >
            OK
          </v-btn>
        </v-card-actions>
        <v-progress-linear
          v-model="timeBar"
          color="#9cb1bb"
        />
      </v-card>
    </v-dialog>
  </div>
</template>

<script>
  export default {
    props: {
      timeout: {
        type: String,
        default: '2000',
      },
      text: {
        type: String,
        default: 'Email saved',
      },
    },

    data () {
      return {
        dialog: false,
        timeBar: 100,
        interval: 0,
      }
    },

    methods: {
      openDialog () {
        this.dialog = true
        this.timeOut()
        this.countDownProgress()
      },
      async timeOut () {
        await new Promise(resolve => setTimeout(resolve, parseInt(this.timeout)))
        this.dialog = false
      },
      countDownProgress () {
        clearInterval(this.interval)
        this.timeBar = 100
        this.interval = window.setInterval(() => {
          if (this.timeBar <= 0) {
            return
          }
          this.timeBar -= 2 / parseInt(this.timeout) * 1000
        }, 20)
      },
    },
  }
</script>
