<script>
  // Extensions
  import View from '@/views/View'

  // Mixins
  import LoadSections from '@/mixins/load-sections'

  export default {
    name: 'Contact',

    metaInfo: { title: 'Contact' },

    extends: View,

    mixins: [
      LoadSections([
        'hero-alt',
        'keep-in-touch',
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
