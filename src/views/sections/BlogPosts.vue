<template>
  <v-container>
    <v-row
      align="end"
      justify="center"
    >
      <v-col
        cols="auto"
      >
        <blog-card
          image="assets/game-0.png"
          bloglink="blogpost/15"
          samepage="true"
          headline="Octomancer"
          subtitle="Currently my main project"
          text="Game centered around a small octopus trying to regain its magical powers.
          Fight other players and become the Master of Arcane Arts. A collaboration with the one and only
          <a
          class=&quot;
          font-weight-bold
          subtitle-2
          text-decoration-none
          &quot;
          target=&quot;_blank&quot;
          href=&quot;https://svancarastrings.com/&quot;
          >
          Milan Švancara</a>."
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
  export default {
    name: 'Games',

    components: {
      BlogCard: () => import('@/components/base/BlogCard'),
    },
  }
</script>
