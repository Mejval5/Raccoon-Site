<template>
  <v-container
    fluid
    class="pl-0 pt-2"
  >
    <v-row
      justify="center"
    >
      <v-col
        cols="12"
        md="6"
      >
        <v-row>
          <v-col>
            <base-title
              title="BIO"
              class="secondaryText"
            />
            <v-row>
              <v-divider
                class="pb-2"
              />
            </v-row>
            <base-body
              class="primaryText pt-6"
              html="
            My life has revolved around playing and making since early childhood. Ever since kindergarten, I've been playing
            Dungeons and Dragons, Settlers of Catan, Prince of Persia, Counter-Strike, Minecraft, and many more games
            on a day-to-day basis. <br><br>
            When I finished my Master's program in Physics at BUT, I have finally gathered enough courage to follow my lifelong passion of
            game making. I've partnered up with a graphical artist and a music producer
            <a
              class='text-decoration-none linkText'
              href='https://svancarastrings.com/'
              target='_blank'
            >
              Milan Švancara
            </a>
            to start an indie game dev studio
            <a
              class='text-decoration-none linkText'
              href='https://octomancer.com/brotagonists'
              target='_blank'
            >
              Brotagonists™</a>.
            After two years of learning Unity, C#, and game making, I've managed to release a my first game for Android called
            <a
              class='text-decoration-none linkText'
              href='https://octomancer.com/octomancer'
              target='_blank'
            >
              Octomancer</a>.
              <br><br>
              Currently, I am working for a medical company
            <a
              class='text-decoration-none linkText'
              href='https://www.mindmaze.com/'
              target='_blank'
            >
              MindMaze</a> as a Unity generalist mainly focused on UI development.
            "
            />
          </v-col>
        </v-row>
        <v-row>
          <v-col>
            <base-title
              title="INDUSTRY SKILLS"
              class="pb-1 pt-3 secondaryText"
              space="0"
            />
          </v-col>
        </v-row>
        <v-row>
          <v-divider
            class="pb-9"
          />
        </v-row>
        <v-row>
          <v-col
            v-for="(item, i) in codingSkills"
            :key="i"
            cols="6"
            class="py-0"
          >
            <racc-slider-rating
              :label="item.label"
              :value="item.value"
              :icon="item.icon"
            />
          </v-col>
        </v-row>
      </v-col>
      <v-col
        class="d-none d-md-flex"
        cols="1"
      />
      <v-col
        cols="12"
        md="5"
      >
        <v-row>
          <v-col>
            <base-title
              title="TRAITS"
              class="pb-1 secondaryText"
              space="0"
            />
          </v-col>
        </v-row>
        <v-row>
          <v-divider
            class="pb-3"
          />
        </v-row>
        <v-row>
          <v-col
            v-for="(item, i) in hobbies"
            :key="i"
            cols="auto"
          >
            <octo-list-item
              :text="item.text"
              :icon="item.icon"
              :icon-color="item.iconColor"
              color="transparent"
              text-color="primary"
            />
          </v-col>
        </v-row>
        <v-row>
          <v-col>
            <base-title
              class="pt-3 pb-1 secondaryText"
              title="HOBBIES"
              space="0"
            />
          </v-col>
        </v-row>
        <v-row>
          <v-divider
            class="pb-3"
          />
        </v-row>
        <v-row>
          <v-col
            v-for="(item, i) in tags"
            :key="i"
            cols="auto"
          >
            <octo-list-item
              :text="item.text"
              :icon="item.icon"
              color="#48667466"
              :icon-color="item.iconColor"
              text-color="primary"
            />
          </v-col>
        </v-row>
        <v-row>
          <v-col>
            <base-title
              title="LANGUAGES"
              class="pb-1 pt-6 secondaryText"
              space="0"
            />
          </v-col>
        </v-row>
        <v-row>
          <v-divider
            class="pb-3"
          />
        </v-row>
        <v-row>
          <v-col
            v-for="(item, i) in languages"
            :key="i"
            cols="12"
          >
            <racc-star-rating
              :label="item.label"
              :value="item.value"
              :icon="item.icon"
            />
          </v-col>
        </v-row>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
  export default {
    data () {
      return {
        hobbies: [
          { icon: 'mdi-shape-outline', iconColor: 'pink lighten-2', text: 'Generalist' },
          { icon: 'mdi-trophy-variant-outline', iconColor: 'yellow darken-2', text: 'Goal driven' },
          { icon: 'mdi-school', iconColor: 'red lighten-1', text: 'Educator' },
          { icon: 'mdi-meditation', iconColor: 'green lighten-1', text: 'Independent' },
          { icon: 'mdi-av-timer', iconColor: 'blue lighten-1', text: 'Fast learner' },
          { icon: 'mdi-telescope', iconColor: 'purple', text: 'Explorer' },
        ],
        tags: [
          { icon: 'mdi-leaf', text: 'Plant care', iconColor: 'green lighten-2' },
          { icon: 'mdi-dice-d20-outline', text: 'DnD', iconColor: 'purple darken-2' },
          { icon: 'mdi-hammer-wrench', text: 'DIY', iconColor: 'grey lighten-1' },
          { icon: 'mdi-bowl-outline', text: 'Tea', iconColor: 'green darken-2' },
          { icon: 'mdi-run-fast', text: 'Jogging', iconColor: 'blue darken-1' },
          { icon: 'mdi-lambda', text: 'Gaming', iconColor: 'orange darken-2' },
          { icon: 'mdi-flask', text: 'Game jams', iconColor: 'red lighten-2' },
        ],
        codingSkills: [
          { label: 'Unity', value: 70, icon: 'mdi-unity' },
          { label: 'C#', value: 60, icon: 'mdi-microsoft-visual-studio' },
          { label: 'Python', value: 30, icon: 'mdi-language-python' },
          { label: 'Typescript', value: 40, icon: 'mdi-language-typescript' },
        ],
        languages: [
          { label: 'English', value: 5 },
          { label: 'German', value: 2 },
        ],
      }
    },
  }
</script>

<style>

</style>
