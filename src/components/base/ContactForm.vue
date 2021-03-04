<template>
  <div
    :class="$vuetify.breakpoint.mdAndUp ? 'text-right' : 'text-center'"
  >
    <v-form
      ref="form"
      v-model="valid"
    >
      <base-info-card
        :title="title"
        :subtitle="subtitle"
        space="4"
        color="primary"
      />

      <base-text-field
        id="frmNameA"
        v-model="name"
        label="Name"
        :rules="nameRules"
        name="name"
        required
        autocomplete="name"
      />

      <base-text-field
        id="frmEmailA"
        v-model="email"
        label="Email"
        :rules="emailRules"
        validate-on-blur
        type="email"
        name="email"
        required
        autocomplete="email"
      />

      <base-text-field
        v-model="subject"
        label="Subject"
        :rules="subjectRules"
        validate-on-blur
      />

      <base-textarea
        v-model="text"
        class="mb-0"
        label="Your Need & Description"
        :rules="textRules"
        validate-on-blur
      />

      <v-btn
        outlined
        x-large
        class="rounded mb-5 mx-auto"
        @click="save_email"
      >
        Send message
      </v-btn>
      <div
        class="primaryText mb-5 text-caption"
      >
        This site is protected by reCAPTCHA and the Google
        <a href="https://policies.google.com/privacy">Privacy Policy</a> and
        <a href="https://policies.google.com/terms">Terms of Service</a> apply.
      </div>
      <octo-email-saved
        ref="dialog01"
        timeout="3000"
        text="Email sent!"
      />
    </v-form>
  </div>
</template>

<script>
  export default {
    name: 'BaseContactForm',

    props: {
      subtitle: String,
      title: {
        type: String,
        default: 'MAIL ME YOUR MESSAGE',
      },
    },

    data: () => ({
      valid: true,
      name: '',
      email: '',
      subject: '',
      text: '',
      emailRules: [
        v => /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{1,10})+$/.test(v) || 'E-mail must be valid',
      ],
      textRules: [
        v => !!v || 'Missing text body',
      ],
      nameRules: [
        v => !!v || 'Missing name',
      ],
      subjectRules: [
        v => !!v || 'Missing subject',
      ],
    }),

    watch: {
      $route (from, to) {
        this.$refs.form.reset()
      },
    },
    methods: {
      test_email (mail) {
        const re = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{1,10})+$/
        return re.test(mail)
      },
      are_all_fields_filled () {
        return this.name !== '' && this.email !== '' && this.subject !== '' && this.text !== ''
      },
      async save_email () {
        const token = await this.recaptcha()
        this.validate()
        if (this.test_email(this.email) && this.are_all_fields_filled()) {
          let adress = 'https://us-central1-website-raccoon.cloudfunctions.net/sendUsEmail'
          adress += '?name=' + this.name
          adress += '&email=' + this.email
          adress += '&subject=' + this.subject
          adress += '&text=' + this.text
          adress += '&token=' + token
          this.axios(
            {
              method: 'post',
              url: adress,
              data: {
              },
              headers: { 'Access-Control-Allow-Origin': '*' },
            },
          ).catch()
          this.$refs.form.reset()
          this.name = ''
          this.email = ''
          this.subject = ''
          this.text = ''
          this.$refs.dialog01.openDialog()
        }
      },
      validate () {
        this.$refs.form.validate()
      },
      reset () {
        this.$refs.form.reset()
      },
      resetValidation () {
        this.$refs.form.resetValidation()
      },
      async recaptcha () {
        // (optional) Wait until recaptcha has been loaded.
        await this.$recaptchaLoaded()

        // Execute reCAPTCHA with action "login".
        return this.$recaptcha('login')
        // Do stuff with the received token.
      },
    },

    // Injected from the Vuetify Themeable mixin
    inject: ['theme'],
  }
</script>

<style>
input:-webkit-autofill,
input:-webkit-autofill:hover,
input:-webkit-autofill:focus,
input:-webkit-autofill:active {
    -webkit-transition-delay: 9999s;
    -webkit-transition: color 9999s ease-out, background-color 9999s ease-out;
}
</style>
