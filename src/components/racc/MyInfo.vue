<template>
  <v-container
    fluid
    class="pl-0 pt-2 pb-0"
  >
    <v-row>
      <v-col
        cols="12"
        md="6"
        class="pr-md-8"
      >
        <v-row>
          <v-col>
            <base-title
              title="BIO"
              class="secondaryText"
            />
            <v-row>
              <v-divider
                class="pb-0"
              />
            </v-row>
            <base-body
              class="primaryText pt-6"
              html="
            <p>Welcome! I’m Daniel Necesal, a Lead Software Developer with 6+ years of experience specializing in Unity,
               Python, and full-stack development. 
               I combine technical expertise with creativity, 
               leading projects that range from game development to medical software. 
               My passion lies in delivering high-quality solutions that exceed 
               expectations and meet the demands of diverse industries.
</p>
            "
            />
          </v-col>
        </v-row>
        <v-row
        class="pt-0"
        >
          <v-col
          class="pt-0"
          >
            <base-title
              title="CAREER HIGHLIGHTS"
              class="secondaryText"
            />
            <v-row>
              <v-divider
                class="pb-0"
              />
            </v-row>
            <base-body
              class="primaryText pt-6"
              html="
  <section id='experience'>
    <div class='experience-item'>
      <h3>Lead Software Engineer | MINDMAZE</h3>
      <p>Leading cross-functional teams, I’ve delivered several projects from concept to launch. I specialize in medical device development, performance optimization, and automating testing pipelines.</p>
    </div>

    <div class='experience-item'>
      <h3>Unity Mobile Game Developer | TINYSOFT</h3>
      <p>Increased user engagement by 50% through the development of new features and frameworks for a mobile game.</p>
    </div>

    <div class='experience-item'>
      <h3>Indie Development and Teaching</h3>
      <p>As a co-founder of
        <a class='font-weight-bold subtitle-1 linkText text-decoration-none'
           target='_blank'
           href='https://octomancer.com/brotagonists'>
           BROTAGONISTS</a>,
        I've pushed the limits of mobile game development with the release of
        <a class='font-weight-bold subtitle-1 linkText text-decoration-none'
           target='_blank'
           href='https://octomancer.com/octomancer'>
           Octomancer - Octopus Adventure</a>.
      </p>
    </div>

    <div class='experience-item'>
      <h3>Unity & Python Instructor</h3>
      <p>Taught Unity and Python to aspiring developers, delivering both in-person and online courses.</p>
    </div>
  </section>

            "
            />
          </v-col>
        </v-row>
      </v-col>
      <v-col
        cols="12"
        md="6"
        class="pl-md-8"
      >
        <v-row>
          <v-col
          class="pb-0"
          >
            <base-title
              title="SKILLS"
              class="secondaryText"
            />
            <v-row>
              <v-divider
                class="pb-0"
              />
            </v-row>
            <base-body
              class="primaryText pt-6 pb-2"
              html="

  <b>Languages:</b> C#, Python, TypeScript, PowerShell, Kotlin, HLSL, C++, JavaScript, SQL, Java
  <br><b>Technologies:</b> Full Stack Development, VR Optimization, UI/UX, Compute Shaders, CI/CD Automation, Procedural Generation, Firebase Integration
  <br><b>Tools:</b> Rider, Jenkins, Git, Unity, Blender, Photoshop, Azure, Atlassian Suite, Lucid, GitHub, Unreal Engine, Stable Diffusion
  <br><b>Development Practices:</b> Agile, TDD, Scrum, Kanban, Medical Device Software Development, Regulatory Compliance
  <br><b>Web Technologies:</b> Node.js, Vue.js, ASP.NET, Django, MongoDB, REST APIs
            "
            />
          </v-col>
        </v-row>
        <v-row>
          <v-col>
            
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
            class="pb-2"
          />
        </v-row>
        <v-row class=" pb-4">
          <v-col
            v-for="(item, i) in hobbies"
            :key="i"
            cols="auto"
            class="pb-0 mt-4"
          >
            <octo-list-item
              :text="item.text"
              :icon="item.icon"
              :icon-color="item.iconColor"
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
            class="pb-2"
          />
        </v-row>
        <v-row>
          <v-col
            v-for="(item, i) in tags"
            :key="i"
            cols="auto"
            class="pb-0 mt-4"
          >
            <octo-list-item
              :text="item.text"
              :icon="item.icon"
              color="transparent"
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
          { icon: 'mdi-bullseye', iconColor: 'yellow', text: 'Determined' },
          { icon: 'mdi-math-compass', iconColor: 'blue', text: 'Precise' },
          { icon: 'mdi-school', iconColor: 'red lighten-1', text: 'Educator' },
          { icon: 'mdi-meditation', iconColor: 'green lighten-1', text: 'Independent' },
          { icon: 'mdi-av-timer', iconColor: 'blue lighten-1', text: 'Fast learner' },
          { icon: 'mdi-book-open-variant', iconColor: 'purple', text: 'Multi Disciplinary' },
          { icon: 'mdi-rocket', iconColor: 'blue darken-2', text: 'Innovator' },
          { icon: 'mdi-account-multiple', iconColor: 'green darken-2', text: 'Team player' },
        ],
        tags: [
          { icon: 'mdi-leaf', text: 'Plants', iconColor: 'green lighten-2' },
          { icon: 'mdi-dice-d20-outline', text: 'DnD', iconColor: 'purple darken-2' },
          { icon: 'mdi-hammer-wrench', text: 'DIY Projects', iconColor: 'grey lighten-1' },
          { icon: 'mdi-bowl-outline', text: 'Tea', iconColor: 'green darken-2' },
          { icon: 'mdi-run-fast', text: 'Jogging', iconColor: 'blue darken-1' },
          { icon: 'mdi-lambda', text: 'Gaming', iconColor: 'orange darken-2' },
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
