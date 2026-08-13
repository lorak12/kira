// Polish test sentences for the TTS bake-off. Deliberately shaped like
// things Kira would actually say back to karol -- mixes inflected English
// app/brand names (which trip up a lot of TTS phonemizers, e.g. "Discorda",
// "Chrome'a", "OBS-a"), Polish music artist names, numbers/times, and a
// couple of full diacritics to stress-test pronunciation, not just fluency.

export const texts = [
  {
    id: 'short_confirmation',
    text: 'Zamykam Discorda i włączam ci Spotify. Powinno się otworzyć za momencik.'
  },
  {
    id: 'music_playlist',
    text:
      'Włączyłam playlistę na Spotify — lecą Sanah, Dawid Podsiadło, Mrozu, Vito Bambino i Taco Hemingway. ' +
      'Jak coś nie pasuje, powiedz, to zmienię.'
  },
  {
    id: 'system_status',
    text:
      "Sprawdziłam — masz włączonego Discorda, Chrome'a, Visual Studio Code i OBS-a. " +
      'Procesor siedzi na trzydziestu ośmiu procentach, a wentylatory się nie drą, więc chyba żyjemy.'
  },
  {
    id: 'reminders_and_witty',
    text:
      'No dobra, wyłączam WiFi na chwilę, bo router robi dziwne rzeczy. Ustawiam budzik na siódmą trzydzieści ' +
      'i przypominam, że w czwartek masz konsultacje z Kowalskim o czternastej piętnaście. Nie dziękuj, wiem że jestem najlepsza.'
  }
]
