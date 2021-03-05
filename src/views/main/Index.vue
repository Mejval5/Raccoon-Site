<template>
  <div>
    <div id="stars" />
    <div id="stars2" />
    <div id="stars3" />
    <div
      class="contain"
    >
      <div
        class="position"
      >
        <racc-menu
          id="menu"
          :current-page="CurrentPage"
          :class="sizeMobile"
          @goToPage="goToPage"
        />
      </div>
    </div>
    <v-overlay
      class="contain"
      :value="!this.pages.mainMenu.val"
      opacity="0.9"
      color="#090909"
    >
      <octo-page
        :visible="this.pages.gamesPage.val"
      >
        <racc-games-inner
          :visible="this.pages.gamesPage.val"
          @clicked="goToPage('mainMenu')"
        />
      </octo-page>
      <octo-page
        :visible="this.pages.blogPage.val"
      >
        <racc-blog-inner
          :visible="this.pages.blogPage.val"
          @clicked="goToPage('mainMenu')"
        />
      </octo-page>
      <octo-page
        :visible="this.pages.contactPage.val"
      >
        <octo-contact-inner
          :visible="this.pages.contactPage.val"
          @clicked="goToPage('mainMenu')"
        />
      </octo-page>
      <octo-page
        :visible="this.pages.aboutPage.val"
      >
        <racc-about-inner
          :visible="this.pages.aboutPage.val"
          @clicked="goToPage('mainMenu')"
        />
      </octo-page>
    </v-overlay>
  </div>
</template>

<script>
  import View from '@/views/View'

  export default {
    name: 'About',

    extends: View,

    data () {
      return {
        pages: {
          mainMenu: { val: true, name: 'Raccoon site', route: '/' },
          aboutPage: { val: false, name: 'About me', route: '/about' },
          gamesPage: { val: false, name: 'Games', route: '/games' },
          blogPage: { val: false, name: 'Blog', route: '/blog' },
          contactPage: { val: false, name: 'Contact', route: '/contact' },
        },
      }
    },

    computed: {
      sizeMobile () {
        if (this.$vuetify.breakpoint.xsOnly) {
          return 'svgSm svgBase'
        }
        if (this.$vuetify.breakpoint.mdAndDown) {
          return 'svgMd svgBase'
        }
        return 'svg svgBase'
      },
      CurrentPage () {
        for (var key in this.pages) {
          if (this.pages[key].val) {
            return key
          }
        }
        console.log('bug')
        return 'wtf'
      },
    },
    watch: {
      $route (to, from) {
        console.log(this.$route.meta.pageName)
        this.UpdatePage(this.$route.meta.pageName)
      },
    },

    beforeMount () {
      this.UpdatePage(this.$route.meta.pageName)
    },
    methods: {
      goToPage (page) {
        if (this.$route.fullPath !== this.pages[page].route) {
          this.$router.push(this.pages[page].route)
        }
      },
      UpdatePage (page) {
        if (Object.keys(this.pages).indexOf(page) > -1) {
          for (var key in this.pages) {
            if (key === page) {
              this.pages[key].val = true
              continue
            }
            this.pages[key].val = false
          }
        }
      },
    },
  }
</script>

<style>
.v-overlay__content {
  height: inherit;
  width: inherit;
}
.contain {
  height: 100%;
  width: 100%;
  overflow: hidden;
  z-index: 100;
  position: inherit;
}
.position {
  transform: translate(0, -5%);
}
.svgBase {
  height: 100vh;
  transition: all 1s;
  position: relative;
}
.svg {
  width: 100%;
  transform: translate(-15%, 0);
}
.svgMd {
  width: 200%;
  transform: translate(-30%, 0);
}
.svgSm {
  width: 300%;
  transform: translate(-50%, 0);
}
</style>

<style lang="sass">

// n is number of stars required
@function multiple-box-shadow ($n)
  $value: '#{random(2000)}px #{random(2000)}px #FFF'
  @for $i from 2 through $n
    $value: '#{$value} , #{random(2000)}px #{random(2000)}px #FFF'

  @return unquote($value)

$shadows-small:  multiple-box-shadow(700)
$shadows-medium: multiple-box-shadow(200)
$shadows-big:    multiple-box-shadow(100)

#stars
  z-index: 10
  width: 1px
  height: 1px
  background: transparent
  box-shadow: $shadows-small
  animation: animStar 50s linear infinite

  &:after
    content: " "
    position: absolute
    top: 2000px
    width: 1px
    height: 1px
    background: transparent
    box-shadow: $shadows-small

#stars2
  z-index: 10
  width: 2px
  height: 2px
  background: transparent
  box-shadow: $shadows-medium
  animation: animStar 100s linear infinite

  &:after
    content: " "
    position: absolute
    top: 2000px
    width: 2px
    height: 2px
    background: transparent
    box-shadow: $shadows-medium

#stars3
  z-index: 10
  width: 3px
  height: 3px
  background: transparent
  box-shadow: $shadows-big
  animation: animStar 150s linear infinite

  &:after
    content: " "
    position: absolute
    top: 2000px
    width: 3px
    height: 3px
    background: transparent
    box-shadow: $shadows-big

@keyframes animStar
  from
    transform: translateY(0px)
  to
    transform: translateY(-2000px)
</style>
