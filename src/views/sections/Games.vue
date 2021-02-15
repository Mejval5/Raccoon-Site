<template>
  <div
    class="mx-0 mb-0 pb-0 py-0"
    style="height: auto;"
  >
    <v-container
      class="fill-height"
      fluid
    >
      <v-row
        align-content="space-around"
        justify="center"
      >
        <v-col
          cols="auto"
        >
          <game-card
            image="assets/game-0.png"
            gamelink="octomancer"
            samepage="true"
            headline="Octomancer"
            subtitle="Currently my main project"
            text="Game centered around a small octopus trying to regain its magical powers.
          Fight other players and become the Master of Arcane Arts. A collaboration with the one and only
          <a
          class=&quot;
          font-weight-bold
          subtitle-1 linkText
          text-decoration-none
          &quot;
          target=&quot;_blank&quot;
          href=&quot;https://svancarastrings.com/&quot;
          >
          Milan Švancara</a>."
          />
        </v-col>

        <v-col
          cols="auto"
        >
          <game-card
            image="assets/plantzie.png"
            gamelink="https://raccoon5.itch.io/plantagonist"
            headline="Sproutagonist"
            subtitle="A one nighter made with Milan!"
            text="Have you ever wanted to be a majestical plant reaching for the heavens with roots reaching deep into the mother earth?
          This game is definitely for you."
          />
        </v-col>

        <v-col
          cols="auto"
        >
          <game-card
            image="assets/V6t0Yh.png"
            gamelink="https://raccoon5.itch.io/piranhasbounty"
            headline="Piranha's bounty"
            subtitle="2 guys, 2 nights, 1 game!"
            text="You are the only one who can save your village from starvation. Grab a fishing pole and go gather enough food for all. Fishing platformer made for
          <a
          class=&quot;
          font-weight-bold
          subtitle-1 linkText
          text-decoration-none
          &quot;
          target=&quot;_blank&quot;
          href=&quot;https://itch.io/jam/minibeansjam3&quot;
          >
          miniBeansJam 3</a>."
          />
        </v-col>

        <v-col
          cols="auto"
        >
          <game-card
            image="assets/game-2.png"
            headline="Billin' around"
            gamelink="https://raccoon5.itch.io/billinaround"
            subtitle="24 hours. Just me. Go!"
            text="Travel through strange worlds filled with evil coins which try to kill you. Simple but fun platformer made for the
          <a
          class=&quot;
          font-weight-bold
          subtitle-1 linkText
          text-decoration-none
          &quot;
          target=&quot;_blank&quot;
          href=&quot;https://itch.io/jam/sppro-discord-gamejam-4/rate/217867&quot;
          >
          SPPRO Discord GameJam 4</a>."
          />
        </v-col>

        <v-col
          cols="auto"
        >
          <game-card
            image="assets/game-3.png"
            gamelink="https://raccoon5.itch.io/space-simulator"
            headline="Space simulator"
            subtitle="Let's learn how to make games!"
            text="This was my first solo project to learn how to program in C#. Watch an early solar system forming out of miniature Earths. Quirky, I know."
          />
        </v-col>
      </v-row>
    </v-container>
  </div>
</template>

<script>
  export default {
    name: 'Games',

    components: {
      GameCard: () => import('@/components/base/GameCard'),
    },
  }
</script>
