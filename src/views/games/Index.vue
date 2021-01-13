<script>
  // Extensions
  import View from '@/views/View'

  // Mixins
  import LoadSections from '@/mixins/load-sections'

  export default {
    name: 'Games',

    metaInfo: { title: 'My Games' },

    extends: View,

    mixins: [
      LoadSections([
        'hero-alt',
        'games',
        'info',
      ]),
    ],

    props: {
      id: {
        type: String,
        default: 'games',
      },
    },
  }
</script>
