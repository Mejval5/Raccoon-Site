<template>
  <div
    :class="classes"
    style="justify-content: center;"
  >
    <base-avatar
      v-if="icon"
      :color="color"
      :icon-color="iconColor"
      :dark="dark"
      :icon="icon"
      :outlined="outlined"
      :size="size"
      class=""
      :href="href"
      :target="target"
    />

    <div :class="horizontal && title && 'ml-6'">
      <base-title
        v-if="title"
        :title="title"
        class="text-uppercase"
        space="3"
      />

      <base-body
        v-if="text || $slots.default"
        :space="horizontal ? 0 : undefined"
        :text="text"
        :html="html"
        class="mx-auto d-flex"
        align="center"
        max-width="700"
      >
        <slot />
      </base-body>
    </div>
  </div>
</template>

<script>
  // Mixins
  import Heading from '@/mixins/heading'

  export default {
    name: 'BaseAvatarCard',

    mixins: [Heading],

    props: {
      align: {
        type: String,
        default: 'left',
      },
      color: String,
      iconColor: {
        type: String,
        default: 'primary',
      },
      dark: Boolean,
      horizontal: Boolean,
      icon: String,
      outlined: {
        type: Boolean,
        default: true,
      },
      space: {
        type: [Number, String],
        default: 8,
      },
      size: {
        type: [Number, String],
        default: 72,
      },
      text: String,
      title: String,
      html: String,
      href: String,
      target: String,
    },

    computed: {
      classes () {
        const classes = [
          `mb-${this.space}`,
        ]

        if (this.horizontal) {
          classes.push('d-flex')

          if (!this.$slots.default && !this.text) {
            classes.push('align-center')
          }
        }

        return classes
      },
    },
  }
</script>
