<script>
  // Extensions
  import View from '@/views/View'

  // Mixins
  import LoadSections from '@/mixins/load-sections'

  export default {
    name: 'About',

    metaInfo: { title: 'About me' },

    extends: View,

    mixins: [
      LoadSections([
        'hero-alt',
        'about-our-product',
        'theme-features',
        'affiliates',
        'newsletter',
        'pro-features',
      ]),
    ],

    props: {
      id: {
        type: String,
        default: 'about',
      },
    },
  }
</script>
