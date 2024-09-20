
<template>
  <div>
    <racc-stars />
    <v-overlay
      :value="true"
      opacity="0.6"
      color="black"
      style="width:100vw; height: 100vh;"
    >
      <v-container
        fluid
        class="no-pad-top dynamic-width pa-0 pb-8 fill-height"
        style="height: 100vh;"
      >
        <v-row
          align="center"
          justify="center"
          class="fill-width"
          style="min-height: 100vh; max-width: 100%; margin: 0;"
        >
          <v-col
          class="pt-0 pb-0"
          cols="12"
          lg="7"
          :order="$vuetify.breakpoint.mdAndUp ? 0 : 2"
          >
          <v-row><v-col
      cols="12"
      sm="6"
      class="py-2"
    >
      <v-btn-toggle
        v-model="toggle_one"
        mandatory
        shaped
        @change="updateLanguage"
      >
        <v-btn>
          EN
        </v-btn>

        <v-btn>
          FR
        </v-btn>
      </v-btn-toggle>
    </v-col>
            <v-card
              class="rounded-lg"
              elevation="2"
            >
              <div
                class="french-section pl-5 pr-5 pt-2"
              >
              <div class ="text-h4">
                {{ extra_text[0].text }}
              </div>
              <div class ="text-h6">
                {{ extra_text[1].text }}  <br>    
                {{ extra_text[2].text }}         
              </div>
              <v-divider></v-divider>
              <v-list
              lines="one"
              >
                <v-list-item
                  v-for="(item, index) in this.items"
                  :key="index"                
                >
                  <v-list-item-icon>
                    <v-icon>mdi-circle-small</v-icon>
                  </v-list-item-icon>
                  <v-list-item-content>
                    <v-list-item-title v-text="item.text"></v-list-item-title>
                  </v-list-item-content>
                </v-list-item>
              </v-list>
              <div class ="text-h5">
                {{ extra_text[3].text }}
              </div>
              <v-divider></v-divider>
              <v-list
              lines="one"
              >
                <v-list-item
                  v-for="(item, index) in this.items2"
                  :key="index"                
                >
                  <v-list-item-icon>
                    <v-icon>mdi-circle-small</v-icon>
                  </v-list-item-icon>
                  <v-list-item-content>
                    <v-list-item-title v-text="item.text"></v-list-item-title>
                  </v-list-item-content>
                </v-list-item>
              </v-list>
              <div class ="text-h6">
                {{ extra_text[4].text }}
              </div>
              <v-divider></v-divider>
              <v-list
              lines="one"
              >
                <v-list-item>
                  <v-list-item-icon>
                    <v-icon>mdi-circle-small</v-icon>
                  </v-list-item-icon>
                  <v-list-item-content>
                    <v-list-item-title>{{ extra_text[5].text }}</v-list-item-title>
                  </v-list-item-content>
                </v-list-item>
              </v-list>
              <div class ="text-h6">
                {{ extra_text[6].text }}
              </div>
              <v-divider></v-divider>
              <v-list
              lines="one"
              >
                <v-list-item>
                  <v-list-item-icon>
                    <v-icon>mdi-circle-small</v-icon>
                  </v-list-item-icon>
                  <v-list-item-content>
                    <v-list-item-title><span v-html="extra_text[7].text"></span><a href="mailto:moberson@prodob.net">moberson@prodob.net</a>.</v-list-item-title>
                  </v-list-item-content>
                </v-list-item>
              </v-list>
              </div>
            </v-card>    
          </v-row>  
          </v-col>
          <v-col
          class="align-center justify-center pt-0 pb-2"
          cols="12"
          lg="5"
          >
            <v-row
              style="max-height: 90vh !important; padding-top: 25px;"
              class="carousel_col align-center justify-center align-self-center"
            >
              <v-carousel
                hide-delimiter-background
                :show-arrows="$vuetify.breakpoint.mdAndUp"
                style="max-width: 100%; height: 90hv; max-height: 90vh !important;"
                :value="0"
                delimiter-icon="mdi-circle-outline"
                :cycle="!this.stopCarouselCycle"
                show-arrows-on-hover
                dark
                v-model="slide"
                align-self="center"
                :touch="{
                      left: () => {
                        slide = slide + 1 % slideCount
                        this.stopCarousel()                  
                      },
                      right: () => {
                        slide--
                        if (slide < 0) {
                          slide = slideCount + slide
                        }
                        this.stopCarousel()                  
                      },
                }"
              >
                <v-carousel-item
                  src="@/assets/preverenges/postel.jpg"
                  cover
                  aspect-ratio="0.66"
                  eager
                  fade
                ></v-carousel-item>

                <v-carousel-item
                  src="@/assets/preverenges/skrin.jpg"
                  cover
                  aspect-ratio="0.66"
                ></v-carousel-item>

                <v-carousel-item
                  src="@/assets/preverenges/kuch.jpg"
                  cover
                  aspect-ratio="0.66"
                ></v-carousel-item>

                <v-carousel-item
                  src="@/assets/preverenges/outside.jpg"
                  cover
                  aspect-ratio="0.66"
                ></v-carousel-item>

                <v-carousel-item
                  src="@/assets/preverenges/koupel.jpg"
                  cover
                  aspect-ratio="0.66"
                ></v-carousel-item>

                <v-carousel-item
                  src="@/assets/preverenges/dum.jpg"
                  cover
                  aspect-ratio="0.66"
                ></v-carousel-item>

                <v-carousel-item
                  src="@/assets/preverenges/kytky.jpg"
                  cover
                  aspect-ratio="0.66"
                ></v-carousel-item>

                <v-carousel-item
                  src="@/assets/preverenges/zahrada.jpg"
                  cover
                  aspect-ratio="0.66"
                ></v-carousel-item>
              </v-carousel>
            </v-row>
          </v-col>
          <v-col
          v-if="!$vuetify.breakpoint.mdAndUp"
          :order=10
          class="d-flex flex-column mx-12 pt-10"
          >            
            <v-btn
              elevation="0"
              outlined
              large
              v-bind="$attrs"
              color="yellow lighten-1"
              v-on="$listeners"
              href="mailto:moberson@prodob.net"
            >
              {{ extra_text[8].text }}
            </v-btn>
          </v-col>
        </v-row>
      </v-container>
    </v-overlay>
  </div>
</template>

<script>
  // Extensions
  import View from '@/views/View'

  export default {
    name: 'Préverenges',

    components: {
    },

    data () {
      return {
        stopCarouselCycle: false,
        slide: 0,
        slideCount: 0,
        items: [],
        items_en: [
          { text: 'Beautiful and very quiet location' },
          { text: 'Furnished or unfurnished (to be agreed upon with the future tenant)' },
          { text: 'Equipped kitchen – induction stove, dishwasher, washing machine/dryer' },
          { text: 'Bathroom with bathtub and Italian-style shower' },
          { text: 'Passive house – no heating costs' },
          { text: 'Finnish sauna available' },
          { text: 'Garden with BBQ available' },
          { text: '2 parking spaces in front of the entrance (no additional cost)' },
          { text: 'Ideal for 1, max. 2 people' },
        ],
        items2_en: [
          { text: '2-month deposit (4000 CHF) in a rental guarantee savings account' },
          { text: 'Swiss employment contract' },
          { text: 'RC ménage assurance' },
          { text: 'resident permit Suisse' },
        ],
        extra_text_en: [
          { text: 'Apartment near Préverenges beach' },
          { text: 'Modern and bright 2.5-room apartment of 55 m²' },
          { text: 'For rent starting January 1st, 2025' },
          { text: 'Rental conditions' },
          { text: 'Price' },
          { text: '2000 CHF/month + utilities (water and electricity - 100 CHF/month)' },
          { text: 'Contact' },
          { text: 'Martina Oberson, tel.&nbsp;0774963846 or ' },
          { text: 'Send Email' },
          
        ],
        items_fr: [
          { text: 'Situation unique et très calme' },
          { text: 'Meublé ou sans meubles (à convenir avec le futur locataire)' },
          { text: 'Cuisine équipée – induction, lave-vaisselle, lave-linge/séchoir' },
          { text: 'Salle de bain avec baignoire et douche italienne' },
          { text: 'Maison passive – pas de frais de chauffage' },
          { text: 'Sauna finnois à disposition' },
          { text: 'Jardin avec BBQ à disposition' },
          { text: '2 places de parking devant la porte d’entrée (sans frais supplémentaires)' },
          { text: 'Idéal pour 1, max. 2 personnes' },
        ],
        items2_fr: [
          { text: '2 mois garantie (4000 CHF) sur un compte d’épargne de garantie de loyer' },
          { text: 'Contrat de travail en Suisse' },
          { text: 'Permis de séjour' },
          { text: 'Assurance RC ménage' },
        ],
        extra_text_fr: [
          { text: 'Appartement proche de la plage de Préverenges' },
          { text: 'Appartement moderne et lumineux de 2.5 pièces de 55m2' },
          { text: 'À louer à partir du 1er janvier 2025' },
          { text: 'Conditions de location' },
          { text: 'Prix' },
          { text: '2000 CHF/mois + charges (l’eau et l’électricité - acompte de 100 CHF/mois)' },
          { text: 'Contact' },
          { text: 'Martina Oberson, tel.&nbsp;0774963846 ou ' },
          { text: 'Envoyer un e-mail' },
        ],
        extra_text: [],
        items2: [],
        toggle_one: this.$route.params.lang === 'fr' ? 1 : 0, // Set the initial value based on the current route
      }
    },

    extends: View,

    props: {
      id: {
        type: String,
        default: 'blog',
      },
      currentBlogPost: String,
    },

    mounted () {
      this.stopCarouselCycle = false
      this.$nextTick(() => {
        this.attachEventListeners()
      })
    },

    created () {
      this.updateLanguage()
    },

    computed: {
    },

    watch: {
      // Watch the `lang` prop to dynamically update the content when the route changes
      lang: 'updateLanguage',
    },

    methods: {
      updateLanguage () {
        if (this.toggle_one === 1) {
          // Navigate to French version
          this.lang = 'fr'
          var routeFr = '/preverenges/fr'
          if (this.$route.path !== routeFr) {
            this.$router.push(routeFr)
          }
        } else {
          // Navigate to English version (default)
          this.lang = 'en'
          var routeEn = '/preverenges/en'
          if (this.$route.path !== routeEn) {
            this.$router.push(routeEn)
          }
        }
        if (this.toggle_one === 1 || this.lang === 'fr') {
          this.items = this.items_fr
          this.items2 = this.items2_fr
          this.extra_text = this.extra_text_fr
        } else {
          this.items = this.items_en
          this.items2 = this.items2_en
          this.extra_text = this.extra_text_en
        }
      },
      attachEventListeners () {
        // Select left and right navigation buttons
        const leftButton = document.querySelector('.v-window__prev button')
        const rightButton = document.querySelector('.v-window__next button')
        const delimiters = document.querySelectorAll('.v-carousel__controls__item')

        // Add click event listeners to detect user interaction
        if (leftButton) {
          leftButton.addEventListener('click', this.stopCarousel)
        }
        if (rightButton) {
          rightButton.addEventListener('click', this.stopCarousel)
        }

        // Add event listeners for delimiters
        delimiters.forEach(delimiter => {
          this.slideCount++
          delimiter.addEventListener('click', this.stopCarousel)
        })
      },
      currentRoute () {
        return String(this.$route.params.blogId)
      },
      goTo404 () {
        this.$router.push('/404')
      },
      stopCarousel () {
        this.stopCarouselCycle = true
      },
    },

  }
</script>

<style>
.carousel_col {
    aspect-ratio: 2 / 3 !important; /* Adjust this to your desired aspect ratio, e.g., 16:9 */
    height: 100% !important; /* The height will automatically adjust based on the aspect ratio */
    max-height: 90vh !important;
    width: auto !important; /* Ensure the carousel takes full width of its container */
    margin: auto;
}
.v-container {
  max-width: 100vw
}
.v-image {
  height: 100% !important;
}
.v-window__container {
  height: calc(100% - 50px) !important;
  display: flex !important;
  flex-direction: column !important;
  border-radius: 8px !important;
}
.v-window-item {
  flex: 1 1 auto !important; /* Allows the item to grow and fill the remaining height */
  height: 100% !important;   /* Ensure it fills the height of the parent */
}
.v-image__image {
  border-radius: 8px !important;
}
.v-carousel {
  aspect-ratio: 2 / 3; /* Adjust this to your desired aspect ratio, e.g., 16:9 */
  width: 100%; /* Ensure the carousel takes full width of its container */
  height: auto; /* The height will automatically adjust based on the aspect ratio */
}
.dynamic-width {
  width: 80vw;
}
.dynamic-height {
  height: 90vh;
}
.v-list-item {
  min-height: 0px;
}
.v-list-item__icon {
  margin-right: 0px !important;
  margin-top: 4px !important;
  margin-bottom: 4px !important;
}
.v-list-item__content {
  padding-top: 4px !important;
  padding-bottom: 4px !important;
}
.v-sheet {
  background-color: #00000000 !important;
}
.theme--dark.v-list {
  background-color: transparent !important;
}
.v-list-item__title {
  white-space: pre-wrap;
}
.v-btn--icon.v-size--small {
}

/* Mobile screen styles */
@media (max-width: 960px) {
  .dynamic-width {
    width: 90vw; /* Change to 100vw or any other width for mobile */
  }
  .dynamic-height {
    height: auto; /* The height will automatically adjust based on the aspect ratio */
  }
  .carousel_col {
      aspect-ratio: 2 / 3 !important; /* Adjust this to your desired aspect ratio, e.g., 16:9 */
      height: auto !important; /* The height will automatically adjust based on the aspect ratio */
      max-height: 90vh !important;
      width: 100% !important; /* Ensure the carousel takes full width of its container */
      margin: auto;
  }
  .no-pad-top {
    padding-top: 0px !important;
    overflow-y: auto;
  }
  .v-btn--icon.v-size--small {
    max-height: calc(50vw / 8);
    max-width: calc(45vw / 8);
  }
}
</style>
