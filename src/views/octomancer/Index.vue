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
        'newsletter',
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
