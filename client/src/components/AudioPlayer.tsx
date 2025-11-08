import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import introMusicPath from "@assets/Intro-news_1762617356857.mp3";

interface AudioPlayerProps {
  audioPath?: string;
  reportDate: string | Date;
  "data-testid"?: string;
}

export function AudioPlayer({ audioPath, reportDate, "data-testid": testId }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isIntroPlaying, setIsIntroPlaying] = useState(false);

  const introAudioRef = useRef<HTMLAudioElement | null>(null);
  const mainAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    introAudioRef.current = new Audio(introMusicPath);
    if (audioPath) {
      mainAudioRef.current = new Audio(audioPath);
    }

    const intro = introAudioRef.current;
    const main = mainAudioRef.current;

    if (intro) {
      intro.volume = volume;
    }
    if (main) {
      main.volume = volume;
      
      const updateTime = () => setCurrentTime(main.currentTime);
      const updateDuration = () => setDuration(main.duration);
      const handleEnded = () => setIsPlaying(false);

      main.addEventListener("timeupdate", updateTime);
      main.addEventListener("loadedmetadata", updateDuration);
      main.addEventListener("ended", handleEnded);

      return () => {
        main.removeEventListener("timeupdate", updateTime);
        main.removeEventListener("loadedmetadata", updateDuration);
        main.removeEventListener("ended", handleEnded);
      };
    }
  }, [audioPath, volume]);

  const handlePlayPause = async () => {
    if (!audioPath) return;

    const intro = introAudioRef.current;
    const main = mainAudioRef.current;

    if (!intro || !main) return;

    if (isPlaying) {
      intro.pause();
      main.pause();
      setIsPlaying(false);
      setIsIntroPlaying(false);
    } else {
      setIsPlaying(true);
      setIsIntroPlaying(true);

      intro.currentTime = 0;
      intro.volume = volume;
      
      try {
        await intro.play();

        const fadeOutDuration = 2000;
        const fadeOutStart = (intro.duration - fadeOutDuration / 1000) * 1000;
        
        setTimeout(() => {
          const fadeOutInterval = setInterval(() => {
            if (intro.volume > 0.1) {
              intro.volume = Math.max(0, intro.volume - 0.1);
            } else {
              clearInterval(fadeOutInterval);
              intro.pause();
              setIsIntroPlaying(false);
            }
          }, 100);
        }, fadeOutStart);

        intro.addEventListener("ended", async () => {
          setIsIntroPlaying(false);
          main.volume = volume;
          try {
            await main.play();
          } catch (err) {
            console.error("Error playing main audio:", err);
            setIsPlaying(false);
          }
        }, { once: true });

      } catch (err) {
        console.error("Error playing intro audio:", err);
        setIsPlaying(false);
        setIsIntroPlaying(false);
      }
    }
  };

  const handleSeek = (values: number[]) => {
    const main = mainAudioRef.current;
    if (main && !isIntroPlaying) {
      main.currentTime = values[0];
      setCurrentTime(values[0]);
    }
  };

  const handleVolumeChange = (values: number[]) => {
    const newVolume = values[0];
    setVolume(newVolume);
    setIsMuted(newVolume === 0);
    
    if (introAudioRef.current) {
      introAudioRef.current.volume = newVolume;
    }
    if (mainAudioRef.current) {
      mainAudioRef.current.volume = newVolume;
    }
  };

  const toggleMute = () => {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    const newVolume = newMuted ? 0 : 1;
    setVolume(newVolume);
    
    if (introAudioRef.current) {
      introAudioRef.current.volume = newVolume;
    }
    if (mainAudioRef.current) {
      mainAudioRef.current.volume = newVolume;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!audioPath) {
    return (
      <div className="text-center text-muted-foreground" data-testid={testId}>
        <p className="text-sm">Audio report is being generated...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl space-y-6" data-testid={testId}>
      {/* Play/Pause Button */}
      <div className="flex justify-center">
        <Button
          size="icon"
          variant="default"
          className="h-24 w-24 rounded-full shadow-lg hover-elevate active-elevate-2"
          onClick={handlePlayPause}
          data-testid="button-play-pause"
        >
          {isPlaying ? (
            <Pause className="h-10 w-10" />
          ) : (
            <Play className="h-10 w-10 ml-1" />
          )}
        </Button>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <Slider
          value={[currentTime]}
          max={duration || 100}
          step={1}
          onValueChange={handleSeek}
          disabled={isIntroPlaying}
          className="cursor-pointer"
          data-testid="slider-progress"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span data-testid="text-current-time">{formatTime(currentTime)}</span>
          <span data-testid="text-duration">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Volume Control */}
      <div className="flex items-center gap-3">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={toggleMute}
          data-testid="button-mute"
        >
          {isMuted ? (
            <VolumeX className="h-4 w-4" />
          ) : (
            <Volume2 className="h-4 w-4" />
          )}
        </Button>
        <Slider
          value={[volume]}
          max={1}
          step={0.01}
          onValueChange={handleVolumeChange}
          className="w-32"
          data-testid="slider-volume"
        />
      </div>
    </div>
  );
}
