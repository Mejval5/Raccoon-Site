<script>
  import Heading from './Heading'
  import Header from '@/mixins/heading'

  export default {
    name: 'BaseTitle',

    extends: Heading,

    mixins: [Header],

    props: {
      size: {
        type: String,
        default: 'headline',
      },
      mobileSize: {
        type: String,
        default: 'headline',
      },
      tag: {
        type: String,
        default: 'h3',
      },
      weight: {
        type: String,
        default: 'bold',
      },
    },
  }
</script>
