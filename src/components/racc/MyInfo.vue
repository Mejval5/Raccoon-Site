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
            <p>Welcome! I'm Daniel Nečesal, a dedicated and innovative Game Developer with over 5 years of
             experience specializing in Unity Engine. My journey in game development is marked by a passion
              for creating immersive gaming experiences and a proven track record of leading projects to success. </p>
            "
            />
          </v-col>
        </v-row>
        <v-row>
          <v-col>
            <base-title
              title="CAREER HIGHLIGHTS"
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
<h3> MindMaze Unity Generalist Engineer </h3>
Here, I've led several projects with cross-functional teams from ideation to launch, optimized game performance for various hardware,
and integrated robust CI pipelines for improved testing and deployment.
<p><h3> Tinysoft Unity Mobile Game Developer </h3>
My analytics-driven approach significantly increased user engagement by 50% over 3 months,
a testament to my ability to understand and cater to user needs.</p>
<p><h3> Indie Development and Teaching </h3>
As a co-founder of
<a
          class=&quot;
          font-weight-bold
          subtitle-1 linkText
          text-decoration-none
          &quot;
          target=&quot;_blank&quot;
          href=&quot;https://octomancer.com/brotagonists&quot;
          >
           BROTAGONISTS</a>

, I've pushed the limits of mobile game development
with the release of
<a
          class=&quot;
          font-weight-bold
          subtitle-1 linkText
          text-decoration-none
          &quot;
          target=&quot;_blank&quot;
          href=&quot;https://octomancer.com/octomancer&quot;
          >
           Octomancer - Octopus Adventure</a>
. I also share my passion and knowledge
by teaching Unity and Python, shaping the next generation of game developers.</p>
            "
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
              title="PROFESSIONAL EXPERTISE"
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
<p>My technical prowess spans a range of languages, including <b>C#</b>, <b>TypeScript</b>, and <b>Python</b>,
with specializations in <b>optimization</b>, <b>UI</b>, <b>editor tools</b>, and both <b>2D/3D math</b>. I've honed my
skills in <b>Android</b> and <b>Windows development</b>, delving into <b>compute shaders</b>, <b>automated testing & deployment</b>, and
 <b>translations integration</b>. I'm proficient with a suite of tools that drive my efficiency and creativity: <b>Rider, Blender,
  Photoshop, Jenkins</b>, and more.</p>
            "
            />
          </v-col>
        </v-row>
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
