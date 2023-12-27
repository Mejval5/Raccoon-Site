<template>
  <section
    id="contact-us"
    class="primary mx-5 pt-5 pb-5 mb-5 rounded-xl"
  >
    <v-row
      align="center"
      justify="center"
    >
      <v-container
        class="px-0 mx-0"
      >
        <v-row
          class="ma-0"
          justify="end"
        >
          <v-col
            class="text-h6 white--text text-center"
          >
            Sign up for Closed Beta
          </v-col>
        </v-row>
        <v-row
          class="px-8 px-lg-0 mb-0"
          justify="center"
        >
          <v-col
            cols="12"
            sm="8"
            md="8"
            lg="4"
          >
            <v-text-field
              v-model="email"
              :class="$vuetify.breakpoint.xsOnly ? &quot;centered-input mx-0&quot; : &quot;&quot;"
              :rules="emailRules"
              outlined
              dense
              hide-details
              :label="$vuetify.breakpoint.xs ? &quot;Your Email address&quot; : &quot;Your Email address used for Google Play&quot;"
            />
          </v-col>
          <v-col cols="auto">
            <v-btn
              class="mb-0"
              height="40"
              outlined
              @click="save_email"
            >
              Subscribe
            </v-btn>
          </v-col>
        </v-row>
      </v-container>
    </v-row>
    <base-snack-bar
      :snackbar="snack"
      text="Email sent successfully!"
      timeout="2000"
    />
  </section>
</template>

<script>
  export default {
    name: 'EmailSignUp',
    data: () => ({
      snack: false,
      email: '',
      emailRules: [
        v => !v || /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{1,5})+$/.test(v) || 'E-mail must be valid',
      ],
    }),
    methods: {
      test_email (mail) {
        const re = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{1,5})+$/
        return re.test(mail)
      },
      save_email () {
        if (this.test_email(this.email)) {
          this.axios.post('https://us-central1-website-raccoon.cloudfunctions.net/uploadEmail?text=' + this.email, this.email,
                          { headers: { 'Access-Control-Allow-Origin': '*' } }).catch()
          // // this captures and saves the email for later use
          // const Http = new XMLHttpRequest()
          // const url = 'https://us-central1-website-raccoon.cloudfunctions.net/uploadMail?text=' + this.email
          // Http.open('GET', url)
          // Http.send()
          this.email = ''
          this.snack = true
        }
      },
    },
  }
</script>
<style lang="scss">
.centered-input.v-text-field .v-label{
  left: 50% !important;
  transform: translateX(-50%);
  transform-origin: top 50%;
  &.v-label--active
  {
    transform: translateY(-18px) scale(.75) translateX(-50%);
  }
}
.centered-input.v-text-field input {
      text-align: center;
}
// Disgusting legend hack to center it ()
.centered-input.v-text-field legend {
      margin-left: calc(50% - 102.5px/2 - 2px);
}
</style>
