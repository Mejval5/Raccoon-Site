<script>
  // Extensions
  import View from '@/views/View'

  // Mixins
  import LoadSections from '@/mixins/load-sections'

  export default {
    name: 'Octomancer',

    metaInfo: { title: 'Octomancer' },

    extends: View,

    mixins: [
      LoadSections([
        'hero-alt',
        'about-our-product',
        'theme-features',
        'newsletter',
        'pro-features',
        'info',
      ]),
    ],

    props: {
      id: {
        type: String,
        default: 'octomancer',
      },
    },
  }
</script>
