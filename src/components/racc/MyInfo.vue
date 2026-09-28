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
            <p>Welcome! I’m Daniel Necesal, Head of Engineering at
               <a class='font-weight-bold subtitle-1 linkText text-decoration-none'
                  target='_blank'
                  href='https://tomplay.com/'>TOMPLAY</a>,
               where I lead the team behind a music learning platform with 2M registered users
               on iOS, Android, Windows, macOS and web.
               I have 7+ years in Unity, C#/.NET and C++, four of them leading engineering teams,
               across games, real-time 3D/VR and regulated medical software.
</p>
            <p>I’m still hands-on, anywhere from GPU profiling to roadmap negotiation,
               and I build AI-augmented engineering workflows: AI review on every pull request,
               agentic coding pipelines, and tooling that lets a whole company use AI safely.
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
      <h3>Head of Engineering | TOMPLAY</h3>
      <p>I lead a ~10-person remote team across Unity, audio, note recognition, backend and web, and report to the CEO.
        We went from 2 feature releases a year to 6 in the first nine months of 2026, cut median open-bug age from 374 to 23 days,
        and held 99.5% crash-free sessions through a full platform rebuild. I also own the AI-augmented engineering workflow
        and AI adoption across the company.</p>
    </div>

    <div class='experience-item'>
      <h3>Lead Software Engineer | MINDMAZE</h3>
      <p>Engineering lead on a real-time 3D/VR rehabilitation product. I led 5 major projects from breakdown to launch,
        delivered health software under IEC 62304 and ISO 13485, migrated the render pipeline to URP,
        and ported the product to Android for low-end hardware.</p>
    </div>

    <div class='experience-item'>
      <h3>Unity Mobile Game Developer | TINYSOFT</h3>
      <p>Built campaign mode and a level-sharing framework for SandBox: Sand Pixel Simulator, lifting user engagement by 50% in 3 months.</p>
    </div>

    <div class='experience-item'>
      <h3>Indie Development and Teaching</h3>
      <p>As a co-founder of <b>BROTAGONISTS</b>,
        I've pushed the limits of mobile game development with the release of
        <a class='font-weight-bold subtitle-1 linkText text-decoration-none'
           target='_blank'
           href='https://raccoon5.itch.io/octomancer'>
           Octomancer - Octopus Adventure</a>.
        I taught Python and C#/Unity game development at ICT Pro and Skillmea, and scripted for Bohemia Interactive.
      </p>
    </div>

    <div class='experience-item'>
      <h3>Microoptics Engineer | EPFL</h3>
      <p>Before software, I built a holographic microscope and its controller for the nano-photonics laboratory, which ended in a published paper.</p>
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

  <b>Leadership:</b> Engineering Management, Technical Strategy, Hiring, Org Design, Roadmap Planning, Incident Response, Medical Software Regulatory Documentation
  <br><b>AI Engineering:</b> Agentic Coding Pipelines, AI Code Review, Claude Code, MCP Tooling and Connectors, AI Adoption Strategy
  <br><b>Rendering:</b> Custom Render Pipelines (VR, 2D Compositing), Compute Shaders, Draw-Call Batching and Instancing, URP/HDRP Migration, Mobile GPU Profiling
  <br><b>Languages:</b> C#, C++, Python, TypeScript, JavaScript, PHP, SQL, HLSL
  <br><b>Tools:</b> Unity, .NET, Burst, Jobs, UniTask, NUnit, GitLab CI, GitHub Actions, Jenkins, Firebase, Azure, Blender, Unreal Engine
  <br><b>Web Technologies:</b> Vue.js, Node.js, FastAPI, ASP.NET, MySQL, MongoDB, REST APIs
            "
            />
          </v-col>
        </v-row>
        <v-row>
          <v-col />
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
