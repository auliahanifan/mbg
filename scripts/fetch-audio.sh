#!/usr/bin/env bash
# Downloads CC0/CC-BY recordings (Freesound previews, OpenGameArt, Kenney) and converts them
# into the mono Ogg Vorbis loops/one-shots the game uses in public/audio. Needs curl, unzip, ffmpeg.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
out=public/audio
mkdir -p "$out"
UA="Mozilla/5.0"
fs() { curl -sSL -A "$UA" -o "$tmp/$1" "https://cdn.freesound.org/previews/$2"; }

fs idle.mp3     369/369053_1535801-hq.mp3     # AndrewAlexander — car_idle_loop (CC0)
fs cruise.mp3   748/748027_16197341-hq.mp3    # Dmitry_mansurev64 — Sedan engine loop (CC0)
fs high.mp3     401/401551_5820033-hq.mp3     # GiocoSound — SFX_Car_Engine_Outside_RPMHigh (CC0)
fs ignition.mp3 369/369056_1535801-hq.mp3     # AndrewAlexander — car_ignition (CC0)
fs horn.mp3     371/371853_5302340-hq.mp3     # Iamgiorgio — J1_Car_Horn (CC0)
fs crash.mp3    592/592388_11537497-hq.mp3    # magnuswaker — Car Crash (with Glass) (CC0)
fs city.mp3     705/705049_1661766-hq.mp3     # felix.blume — Small city ambience with traffic (CC0)
curl -sSL -A "$UA" -o "$tmp/skid.wav" https://opengameart.org/sites/default/files/tires_squal_loop.wav   # Vertigon — Car tire squeal skid loop (CC-BY 3.0)
curl -sSL -A "$UA" -o "$tmp/impact.zip" https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip
curl -sSL -A "$UA" -o "$tmp/jingles.zip" https://kenney.nl/media/pages/assets/music-jingles/f37e530b9e-1677590399/kenney_music-jingles.zip
curl -sSL -A "$UA" -o "$tmp/ui.zip" https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip
for z in impact jingles ui; do unzip -qo "$tmp/$z.zip" -d "$tmp/$z"; done

enc() { # enc <in> <out> <loudness LUFS> [extra filters]
  ffmpeg -v error -y -i "$1" -af "${4:+$4,}loudnorm=I=$3:TP=-1.5:LRA=11" -ac 1 -ar 44100 -c:a libvorbis -q:a 4 "$out/$2.ogg"
}
# seamless loop: body = clip[X..], head = clip[..X], crossfade the head onto the body's tail
loop() { # loop <in> <out> <LUFS> <xfade s> [pre-filter]
  ffmpeg -v error -y -i "$1" -filter_complex "[0]${5:+$5,}asplit[a][b];[a]atrim=start=$4,asetpts=PTS-STARTPTS[body];[b]atrim=end=$4,asetpts=PTS-STARTPTS[head];[body][head]acrossfade=d=$4:c1=tri:c2=tri,loudnorm=I=$3:TP=-1.5:LRA=11" -ac 1 -ar 44100 -c:a libvorbis -q:a 4 "$out/$2.ogg"
}

loop "$tmp/idle.mp3"   engine_idle   -20 0.4
loop "$tmp/cruise.mp3" engine_cruise -20 0.4
loop "$tmp/high.mp3"   engine_high   -20 0.25
loop "$tmp/horn.mp3"   horn          -16 0.3  "atrim=0.4:2.6"
loop "$tmp/skid.wav"   skid          -18 0.2
loop "$tmp/city.mp3"   city          -24 2    "atrim=20:80"
enc "$tmp/ignition.mp3" ignition -18 "atrim=0:2.5,afade=t=out:st=2.0:d=0.5"
enc "$tmp/crash.mp3"    crash    -12
for i in 0 1 2 3; do enc "$tmp/impact/Audio/impactMetal_heavy_00$i.ogg" "bump$i" -14; done
enc "$tmp/jingles/Audio/Pizzicato jingles/jingles_PIZZI04.ogg" pickup  -16
enc "$tmp/jingles/Audio/Pizzicato jingles/jingles_PIZZI02.ogg" deliver -16
enc "$tmp/jingles/Audio/8-Bit jingles/jingles_NES00.ogg"       done    -16
enc "$tmp/jingles/Audio/8-Bit jingles/jingles_NES11.ogg"       fail    -16
enc "$tmp/ui/Audio/select_001.ogg"                             tick    -18
cp "$tmp/impact/License.txt" "$out/LICENSE-kenney.txt"
rm -rf "$tmp"
ls -la "$out"
