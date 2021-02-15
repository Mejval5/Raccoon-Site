<template>
  <div>
    <v-form
      ref="form"
      v-model="valid"
      lazy-validation
    >
      <base-info-card
        :title="title"
        :subtitle="subtitle"
        space="4"
        color="primary"
      />

      <base-text-field
        v-model="name"
        label="Name"
        :rules="nameRules"
        validate-on-blur
      />

      <base-text-field
        v-model="email"
        label="Email"
        :rules="emailRules"
        validate-on-blur
      />

      <base-text-field
        v-model="subject"
        label="Subject"
        :rules="subjectRules"
        validate-on-blur
      />

      <base-textarea
        v-model="text"
        class="mb-6"
        label="Your Need & Description"
        :rules="textRules"
        validate-on-blur
      />

      <base-btn
        :color="!theme.isDark ? 'accent' : 'white'"
        outlined
        class="rounded"
        @click="save_email"
      >
        Send message
      </base-btn>

      <base-snack-bar
        ref="snack01"
        text="Email sent successfully!"
        timeout="2000"
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
        default: 'MAIL US YOUR MESSAGE',
      },
    },

    data: () => ({
      valid: true,
      name: '',
      email: '',
      subject: '',
      text: '',
      emailRules: [
        v => /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{1,5})+$/.test(v) || 'E-mail must be valid',
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
    methods: {
      test_email (mail) {
        const re = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{1,5})+$/
        return re.test(mail)
      },
      are_all_fields_filled () {
        return this.name !== '' && this.email !== '' && this.subject !== '' && this.text !== ''
      },
      save_email () {
        this.validate()
        if (this.test_email(this.email) && this.are_all_fields_filled()) {
          let adress = 'https://us-central1-website-raccoon.cloudfunctions.net/sendUsEmail'
          adress += '?name=' + this.name
          adress += '&email=' + this.email
          adress += '&subject=' + this.subject
          adress += '&text=' + this.text
          this.axios(
            {
              method: 'post',
              url: adress,
              data: {
              },
              headers: { 'Access-Control-Allow-Origin': '*' },
            },
          ).catch()
          this.name = ''
          this.email = ''
          this.subject = ''
          this.text = ''
          this.$refs.snack01.openSnack()
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
    },

    // Injected from the Vuetify Themeable mixin
    inject: ['theme'],
  }
</script>
